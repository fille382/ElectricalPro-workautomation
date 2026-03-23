/**
 * Initial migration: uploads all local IndexedDB records to PocketBase.
 * Only uploads records that don't already have a pb_id (not yet synced).
 */

import { getPBSync } from './pocketbase';
import { getDB } from './db';

type ProgressCallback = (current: number, total: number, collection: string) => void;

interface MigrationResult {
  success: boolean;
  migrated: Record<string, number>;
}

// Map of IndexedDB store names to PocketBase collection names
const STORE_COLLECTIONS: Record<string, string> = {
  jobs: 'jobs',
  tasks: 'tasks',
  photos: 'photos',
  saved_contacts: 'saved_contacts',
  chat_messages: 'chat_messages',
  shopping_list: 'shopping_list',
  panel_schedules: 'panel_schedules',
};

async function getAllFromStore(storeName: string): Promise<any[]> {
  const database = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function updateRecord(storeName: string, record: any): Promise<void> {
  const database = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.put(record);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

/**
 * Migrate all local IndexedDB data to PocketBase.
 * Skips records that already have a pb_id.
 * Sets owner_id on all uploaded records.
 */
export async function migrateToServer(
  onProgress?: ProgressCallback
): Promise<MigrationResult> {
  const pb = getPBSync();
  if (!pb || !pb.authStore.isValid || !pb.authStore.record) {
    return { success: false, migrated: {} };
  }

  const ownerId = pb.authStore.record.id;
  const migrated: Record<string, number> = {};

  // Count total records to migrate
  let total = 0;
  const storeRecords: Record<string, any[]> = {};

  for (const storeName of Object.keys(STORE_COLLECTIONS)) {
    try {
      const records = await getAllFromStore(storeName);
      const unmigrated = records.filter((r) => !r.pb_id);
      storeRecords[storeName] = unmigrated;
      total += unmigrated.length;
    } catch {
      // Store might not exist yet, skip
      storeRecords[storeName] = [];
    }
  }

  let current = 0;

  for (const [storeName, collectionName] of Object.entries(STORE_COLLECTIONS)) {
    const records = storeRecords[storeName] || [];
    let count = 0;

    for (const record of records) {
      current++;
      onProgress?.(current, total, collectionName);

      try {
        // Build the data payload, excluding local-only fields
        const { id: _localId, pb_id: _pbId, _dirty, _deleted, image_data, ...data } = record;

        const payload: Record<string, any> = {
          ...data,
          owner_id: ownerId,
          local_id: record.id,
        };

        let pbRecord;

        if (storeName === 'photos' && image_data instanceof Blob) {
          // Photos: upload as file attachment
          const formData = new FormData();
          for (const [key, value] of Object.entries(payload)) {
            if (value !== undefined && value !== null) {
              formData.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
            }
          }
          formData.append('image_file', image_data, `photo_${record.id}.jpg`);
          pbRecord = await pb.collection(collectionName).create(formData);
        } else {
          // Regular record: serialize complex fields
          const cleanPayload: Record<string, any> = {};
          for (const [key, value] of Object.entries(payload)) {
            if (value !== undefined) {
              cleanPayload[key] = value;
            }
          }
          pbRecord = await pb.collection(collectionName).create(cleanPayload);
        }

        // Write back the pb_id to IndexedDB
        record.pb_id = pbRecord.id;
        record.owner_id = ownerId;
        record._dirty = false;
        await updateRecord(storeName, record);

        count++;
      } catch (err) {
        console.error(`[Migration] Failed to migrate ${storeName} record ${record.id}:`, err);
        // Continue with next record
      }
    }

    migrated[collectionName] = count;
  }

  return { success: true, migrated };
}
