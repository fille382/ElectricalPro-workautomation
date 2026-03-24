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
      // Log detailed error data for debugging
      const pbErr = err as { data?: Record<string, unknown>; response?: Record<string, unknown> };
      console.warn(`[Sync] Failed to push ${item.collection}/${item.local_id}:`, err, 'Data:', pbErr?.data || pbErr?.response);
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
  console.log(`[Sync] Pushing ${item.collection}/${item.local_id}:`, JSON.stringify(data).slice(0, 500));

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
  // Start with only the fields PocketBase expects
  const data: Record<string, unknown> = {};
  const pb = getPBSync();
  const userId = pb?.authStore?.record?.id;

  // Set owner for collections that have it
  if (userId && ['jobs', 'saved_contacts', 'knowledge_base'].includes(collection)) {
    data.owner = userId;
  }

  // Map fields per collection
  switch (collection) {
    case 'jobs':
      data.name = record.name;
      data.address = record.address || '';
      data.description = record.description || '';
      data.contacts = record.contacts ? JSON.stringify(record.contacts) : '[]';
      data.lat = record.lat || 0;
      data.lon = record.lon || 0;
      data.status = record.status || 'active';
      break;

    case 'tasks':
      data.title = record.title;
      data.description = record.description || '';
      data.status = record.status || 'pending';
      data.notes = record.notes || '';
      data.source_photo_id = record.source_photo_id || '';
      data.parent_task_id = record.parent_task_id || '';
      // job relation — needs PB ID of parent job, resolved below
      break;

    case 'photos':
      data.task_id = record.task_id || '';
      data.image_hash = record.image_hash || '';
      data.extracted_info = record.extracted_info ? JSON.stringify(record.extracted_info) : '{}';
      data.user_notes = record.user_notes || '';
      break;

    case 'saved_contacts':
      data.name = record.name;
      data.phone = record.phone || '';
      data.email = record.email || '';
      data.role = record.role || '';
      data.addresses = record.addresses ? JSON.stringify(record.addresses) : '[]';
      break;

    case 'chat_messages':
      data.role = record.role;
      data.content = record.content;
      break;

    case 'shopping_list':
      data.name = record.name;
      data.e_number = record.e_number || '';
      data.article_number = record.article_number || '';
      data.manufacturer = record.manufacturer || '';
      data.category = record.category || '';
      data.quantity = record.quantity || 1;
      data.unit = record.unit || 'st';
      data.checked = record.checked || false;
      data.parent_item_id = record.parent_item_id || '';
      break;

    case 'panel_schedules':
      data.name = record.name;
      data.rows = record.rows ? JSON.stringify(record.rows) : '[]';
      data.fault_contact = record.fault_contact || '';
      data.source_photo_id = record.source_photo_id || '';
      break;

    case 'knowledge_base':
      data.question = record.question || '';
      data.keywords = record.keywords ? JSON.stringify(record.keywords) : '[]';
      data.answer = record.answer || '';
      data.category = record.category || '';
      data.source = record.source || 'ai';
      data.useCount = record.useCount || 0;
      break;
  }

  return data;
}

// These functions interact with IndexedDB and need to be imported from db.ts
// They're defined as async stubs that will be connected in the db.ts modification

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getLocalRecord(collection: string, localId: string): Promise<any> {
  const db = await import('./db');
  const dbInstance = await db.getDB();
  return new Promise((resolve, reject) => {
    const tx = dbInstance.transaction(collection, 'readonly');
    const store = tx.objectStore(collection);
    const request = store.get(localId);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function updateLocalPBId(collection: string, localId: string, pbId: string): Promise<void> {
  const db = await import('./db');
  const dbInstance = await db.getDB();
  return new Promise((resolve, reject) => {
    const tx = dbInstance.transaction(collection, 'readwrite');
    const store = tx.objectStore(collection);
    const getReq = store.get(localId);
    getReq.onsuccess = () => {
      const record = getReq.result;
      if (record) {
        record.pb_id = pbId;
        record._dirty = false;
        store.put(record);
      }
      resolve();
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

async function clearDirtyFlag(collection: string, localId: string): Promise<void> {
  const db = await import('./db');
  const dbInstance = await db.getDB();
  return new Promise((resolve, reject) => {
    const tx = dbInstance.transaction(collection, 'readwrite');
    const store = tx.objectStore(collection);
    const getReq = store.get(localId);
    getReq.onsuccess = () => {
      const record = getReq.result;
      if (record) {
        record._dirty = false;
        store.put(record);
      }
      resolve();
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

async function deleteLocalByPBId(collection: string, pbId: string): Promise<void> {
  const db = await import('./db');
  const dbInstance = await db.getDB();
  return new Promise((resolve, reject) => {
    const tx = dbInstance.transaction(collection, 'readwrite');
    const store = tx.objectStore(collection);
    const getAllReq = store.getAll();
    getAllReq.onsuccess = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const match = getAllReq.result.find((r: any) => r.pb_id === pbId);
      if (match) store.delete(match.id);
      resolve();
    };
    getAllReq.onerror = () => reject(getAllReq.error);
  });
}

async function upsertLocalFromPB(collection: string, pbRecord: Record<string, unknown>): Promise<void> {
  const db = await import('./db');
  const dbInstance = await db.getDB();
  const allRecords = await new Promise<any[]>((resolve, reject) => {
    const tx = dbInstance.transaction(collection, 'readonly');
    const store = tx.objectStore(collection);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existing = allRecords.find((r: any) => r.pb_id === pbRecord.id);

  // Convert PB record to local format
  const localData = convertPBToLocal(collection, pbRecord);

  if (existing) {
    const existingTime = existing.updated_at || existing.created_at || 0;
    const pbTime = new Date(pbRecord.updated as string || pbRecord.created as string).getTime();

    if (pbTime > existingTime && !existing._dirty) {
      await new Promise<void>((resolve, reject) => {
        const tx = dbInstance.transaction(collection, 'readwrite');
        const store = tx.objectStore(collection);
        const req = store.put({ ...existing, ...localData, pb_id: pbRecord.id as string, _dirty: false });
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    }
  } else {
    const newId = `${collection.replace('_', '')}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    await new Promise<void>((resolve, reject) => {
      const tx = dbInstance.transaction(collection, 'readwrite');
      const store = tx.objectStore(collection);
      const req = store.put({ ...localData, id: newId, pb_id: pbRecord.id as string, _dirty: false });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
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
