/**
 * Sync Engine — handles bidirectional sync between IndexedDB and PocketBase.
 *
 * Architecture:
 * - All writes go to IndexedDB first (instant, offline-first)
 * - Background sync pushes changes to PocketBase
 * - Real-time subscriptions pull changes from PocketBase
 * - Conflict resolution: last-write-wins based on updated_at
 */

import { getPBSync } from './pocketbase';
import { getSettings } from './db';
import type { SyncQueueItem } from '../types';

// Event bus for notifying UI of sync updates
const syncEventTarget = new EventTarget();

export function onSyncUpdate(collection: string, callback: () => void): () => void {
  const handler = () => callback();
  syncEventTarget.addEventListener(`sync:${collection}`, handler);
  return () => syncEventTarget.removeEventListener(`sync:${collection}`, handler);
}

export function emitSyncUpdate(collection: string): void {
  syncEventTarget.dispatchEvent(new Event(`sync:${collection}`));
}

// ============ Sync Queue ============

let syncQueue: SyncQueueItem[] = [];
let syncTimer: ReturnType<typeof setTimeout> | null = null;
let isSyncing = false;

// Status listeners
type SyncStatusListener = (status: 'idle' | 'syncing' | 'synced' | 'error') => void;
const statusListeners: Set<SyncStatusListener> = new Set();

export function onSyncStatusChange(listener: SyncStatusListener): () => void {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

function notifyStatus(status: 'idle' | 'syncing' | 'synced' | 'error') {
  statusListeners.forEach(l => l(status));
}

/**
 * Queue a sync operation. Called after every local write.
 * Debounced: waits 1s after last change before processing.
 */
export function queueSync(collection: string, localId: string, action: 'create' | 'update' | 'delete'): void {
  // Deduplicate: remove existing entry for same collection+localId
  syncQueue = syncQueue.filter(q => !(q.collection === collection && q.local_id === localId));

  syncQueue.push({
    id: `sq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    collection,
    local_id: localId,
    action,
    created_at: Date.now(),
    retries: 0,
  });

  // Debounce: process after 1s of inactivity
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => processSyncQueue(), 1000);
}

/**
 * Process pending sync operations.
 */
async function processSyncQueue(): Promise<void> {
  if (isSyncing || syncQueue.length === 0) return;

  const pb = getPBSync();
  if (!pb || !pb.authStore.isValid) return;

  isSyncing = true;
  notifyStatus('syncing');

  const failed: SyncQueueItem[] = [];

  for (const item of [...syncQueue]) {
    try {
      await pushRecord(item);
    } catch (err) {
      console.warn(`[Sync] Failed to push ${item.collection}/${item.local_id}:`, err);
      item.retries++;
      if (item.retries < 5) {
        failed.push(item);
      } else {
        console.error(`[Sync] Giving up on ${item.collection}/${item.local_id} after 5 retries`);
      }
    }
  }

  syncQueue = failed;
  isSyncing = false;
  notifyStatus(failed.length > 0 ? 'error' : 'synced');

  // Retry failed items with backoff
  if (failed.length > 0) {
    const backoff = Math.min(30000, 1000 * Math.pow(2, failed[0].retries));
    setTimeout(() => processSyncQueue(), backoff);
  }
}

/**
 * Push a single record to PocketBase.
 */
async function pushRecord(item: SyncQueueItem): Promise<void> {
  const pb = getPBSync();
  if (!pb) throw new Error('PocketBase not available');

  // Map collection names to PocketBase collection names
  const pbCollection = mapCollectionName(item.collection);

  // Get local record from IndexedDB
  const localRecord = await getLocalRecord(item.collection, item.local_id);

  if (item.action === 'delete') {
    if (localRecord?.pb_id) {
      await pb.collection(pbCollection).delete(localRecord.pb_id);
    }
    return;
  }

  // Prepare data for PocketBase (strip local-only fields)
  const data = preparePBData(item.collection, localRecord);

  if (localRecord.pb_id) {
    // Update existing record
    if (item.collection === 'photos' && localRecord.image_data instanceof Blob) {
      const formData = new FormData();
      Object.entries(data).forEach(([k, v]) => {
        if (v !== undefined && v !== null) formData.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
      });
      formData.append('image', localRecord.image_data);
      await pb.collection(pbCollection).update(localRecord.pb_id, formData);
    } else {
      await pb.collection(pbCollection).update(localRecord.pb_id, data);
    }
  } else {
    // Create new record
    let result;
    if (item.collection === 'photos' && localRecord.image_data instanceof Blob) {
      const formData = new FormData();
      Object.entries(data).forEach(([k, v]) => {
        if (v !== undefined && v !== null) formData.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
      });
      formData.append('image', localRecord.image_data);
      result = await pb.collection(pbCollection).create(formData);
    } else {
      result = await pb.collection(pbCollection).create(data);
    }

    // Write back pb_id to IndexedDB
    await updateLocalPBId(item.collection, item.local_id, result.id);
  }

  // Clear dirty flag
  await clearDirtyFlag(item.collection, item.local_id);
}

// ============ Inbound Sync (PB → Local) ============

let subscriptions: Array<() => void> = [];

/**
 * Start real-time subscriptions for all collections.
 * Called after successful login.
 */
export async function startRealtimeSync(): Promise<void> {
  const pb = getPBSync();
  if (!pb || !pb.authStore.isValid) return;

  // Unsubscribe existing
  stopRealtimeSync();

  const collections = ['jobs', 'tasks', 'photos', 'shopping_list', 'panel_schedules', 'chat_messages'];

  for (const collection of collections) {
    const pbCollection = mapCollectionName(collection);
    try {
      await pb.collection(pbCollection).subscribe('*', (e) => {
        handleRealtimeEvent(collection, e.action, e.record);
      });
      subscriptions.push(() => pb.collection(pbCollection).unsubscribe('*'));
    } catch (err) {
      console.warn(`[Sync] Failed to subscribe to ${pbCollection}:`, err);
    }
  }
}

/**
 * Stop all real-time subscriptions.
 */
export function stopRealtimeSync(): void {
  subscriptions.forEach(unsub => { try { unsub(); } catch {} });
  subscriptions = [];
}

/**
 * Handle a real-time event from PocketBase.
 */
async function handleRealtimeEvent(collection: string, action: string, record: Record<string, unknown>): Promise<void> {
  console.log(`[Sync RT] ${action} on ${collection}:`, record.id);

  if (action === 'delete') {
    await deleteLocalByPBId(collection, record.id as string);
  } else {
    // Create or update
    await upsertLocalFromPB(collection, record);
  }

  emitSyncUpdate(collection);
}

/**
 * Full sync: pull all user's data from PocketBase.
 * Called on first login or manual "Sync Now".
 */
export async function fullSync(): Promise<{ success: boolean; counts: Record<string, number> }> {
  const pb = getPBSync();
  if (!pb || !pb.authStore.isValid) return { success: false, counts: {} };

  notifyStatus('syncing');
  const counts: Record<string, number> = {};

  const collections = ['jobs', 'tasks', 'photos', 'shopping_list', 'panel_schedules',
                       'chat_messages', 'saved_contacts', 'knowledge_base'];

  try {
    for (const collection of collections) {
      const pbCollection = mapCollectionName(collection);
      try {
        const records = await pb.collection(pbCollection).getFullList({ sort: '-created' });
        counts[collection] = records.length;

        for (const record of records) {
          await upsertLocalFromPB(collection, record as unknown as Record<string, unknown>);
        }

        emitSyncUpdate(collection);
      } catch (err) {
        console.warn(`[Sync] Failed to pull ${pbCollection}:`, err);
        counts[collection] = -1; // error indicator
      }
    }

    // Also push any dirty local records
    await processSyncQueue();

    notifyStatus('synced');
    return { success: true, counts };
  } catch (err) {
    console.error('[Sync] Full sync failed:', err);
    notifyStatus('error');
    return { success: false, counts };
  }
}

// ============ Helpers ============

function mapCollectionName(local: string): string {
  // Map local IndexedDB store names to PocketBase collection names
  const map: Record<string, string> = {
    'jobs': 'jobs',
    'tasks': 'tasks',
    'photos': 'photos',
    'settings': 'settings',
    'saved_contacts': 'saved_contacts',
    'chat_messages': 'chat_messages',
    'knowledge_base': 'knowledge_base',
    'shopping_list': 'shopping_list',
    'panel_schedules': 'panel_schedules',
  };
  return map[local] || local;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function preparePBData(collection: string, record: any): Record<string, unknown> {
  // Strip local-only fields and convert to PB format
  const { id, pb_id, _dirty, _deleted, image_data, ...rest } = record;

  // Convert nested objects to JSON strings for PB
  if (collection === 'jobs' && rest.contacts) {
    rest.contacts = JSON.stringify(rest.contacts);
  }
  if (collection === 'panel_schedules' && rest.rows) {
    rest.rows = JSON.stringify(rest.rows);
  }
  if (collection === 'knowledge_base' && rest.keywords) {
    rest.keywords = JSON.stringify(rest.keywords);
  }
  if (collection === 'saved_contacts' && rest.addresses) {
    rest.addresses = JSON.stringify(rest.addresses);
  }
  if (collection === 'photos' && rest.extracted_info) {
    rest.extracted_info = JSON.stringify(rest.extracted_info);
  }

  return rest;
}

// These functions interact with IndexedDB and need to be imported from db.ts
// They're defined as async stubs that will be connected in the db.ts modification

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getLocalRecord(collection: string, localId: string): Promise<any> {
  // Dynamic import to avoid circular dependency
  const db = await import('./db');
  const dbInstance = await db.getDB();
  const tx = dbInstance.transaction(collection, 'readonly');
  const store = tx.objectStore(collection);
  return store.get(localId);
}

async function updateLocalPBId(collection: string, localId: string, pbId: string): Promise<void> {
  const db = await import('./db');
  const dbInstance = await db.getDB();
  const tx = dbInstance.transaction(collection, 'readwrite');
  const store = tx.objectStore(collection);
  const record = await store.get(localId);
  if (record) {
    record.pb_id = pbId;
    record._dirty = false;
    await store.put(record);
  }
  await tx.done;
}

async function clearDirtyFlag(collection: string, localId: string): Promise<void> {
  const db = await import('./db');
  const dbInstance = await db.getDB();
  const tx = dbInstance.transaction(collection, 'readwrite');
  const store = tx.objectStore(collection);
  const record = await store.get(localId);
  if (record) {
    record._dirty = false;
    await store.put(record);
  }
  await tx.done;
}

async function deleteLocalByPBId(collection: string, pbId: string): Promise<void> {
  const db = await import('./db');
  const dbInstance = await db.getDB();
  const tx = dbInstance.transaction(collection, 'readwrite');
  const store = tx.objectStore(collection);
  const allRecords = await store.getAll();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const match = allRecords.find((r: any) => r.pb_id === pbId);
  if (match) {
    await store.delete(match.id);
  }
  await tx.done;
}

async function upsertLocalFromPB(collection: string, pbRecord: Record<string, unknown>): Promise<void> {
  const db = await import('./db');
  const dbInstance = await db.getDB();
  const tx = dbInstance.transaction(collection, 'readwrite');
  const store = tx.objectStore(collection);

  // Find existing record by pb_id
  const allRecords = await store.getAll();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existing = allRecords.find((r: any) => r.pb_id === pbRecord.id);

  // Convert PB record to local format
  const localData = convertPBToLocal(collection, pbRecord);

  if (existing) {
    // Conflict resolution: last-write-wins
    const existingTime = existing.updated_at || existing.created_at || 0;
    const pbTime = new Date(pbRecord.updated as string || pbRecord.created as string).getTime();

    if (pbTime > existingTime && !existing._dirty) {
      // PB record is newer and local hasn't been modified — update local
      await store.put({ ...existing, ...localData, pb_id: pbRecord.id as string, _dirty: false });
    }
    // If local is dirty (has pending changes), keep local version — it will be pushed later
  } else {
    // New record from PB — create locally
    const newId = `${collection.replace('_', '')}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    await store.put({ ...localData, id: newId, pb_id: pbRecord.id as string, _dirty: false });
  }

  await tx.done;
}

function convertPBToLocal(collection: string, pbRecord: Record<string, unknown>): Record<string, unknown> {
  const data: Record<string, unknown> = { ...pbRecord };

  // Remove PB-specific fields
  delete data.id;
  delete data.collectionId;
  delete data.collectionName;
  delete data.expand;

  // Convert PB timestamps to epoch
  if (data.created) {
    data.created_at = new Date(data.created as string).getTime();
    delete data.created;
  }
  if (data.updated) {
    data.updated_at = new Date(data.updated as string).getTime();
    delete data.updated;
  }

  // Parse JSON fields back
  if (collection === 'jobs' && typeof data.contacts === 'string') {
    try { data.contacts = JSON.parse(data.contacts); } catch { data.contacts = []; }
  }
  if (collection === 'panel_schedules' && typeof data.rows === 'string') {
    try { data.rows = JSON.parse(data.rows); } catch { data.rows = []; }
  }
  if (collection === 'knowledge_base' && typeof data.keywords === 'string') {
    try { data.keywords = JSON.parse(data.keywords); } catch { data.keywords = []; }
  }
  if (collection === 'saved_contacts' && typeof data.addresses === 'string') {
    try { data.addresses = JSON.parse(data.addresses); } catch { data.addresses = []; }
  }
  if (collection === 'photos' && typeof data.extracted_info === 'string') {
    try { data.extracted_info = JSON.parse(data.extracted_info); } catch { data.extracted_info = undefined; }
  }

  // Map PB relation field 'job' → local 'job_id'
  if (data.job && !data.job_id) {
    data.job_id = data.job;
    delete data.job;
  }
  if (data.owner && !data.owner_id) {
    data.owner_id = data.owner;
    delete data.owner;
  }

  return data;
}

/**
 * Force process the sync queue immediately.
 */
export async function forceSyncNow(): Promise<void> {
  if (syncTimer) clearTimeout(syncTimer);
  await processSyncQueue();
}

/**
 * Get the number of pending sync items.
 */
export function getPendingSyncCount(): number {
  return syncQueue.length;
}
