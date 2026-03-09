import type { Job, Task, Photo, AppSettings } from '../types';

const DB_NAME = 'electrician_app';
const DB_VERSION = 1;

let db: IDBDatabase | null = null;

/**
 * Initialize the IndexedDB database
 */
export async function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;

      // Create jobs store
      if (!database.objectStoreNames.contains('jobs')) {
        const jobStore = database.createObjectStore('jobs', { keyPath: 'id' });
        jobStore.createIndex('status', 'status', { unique: false });
        jobStore.createIndex('created_at', 'created_at', { unique: false });
      }

      // Create tasks store
      if (!database.objectStoreNames.contains('tasks')) {
        const taskStore = database.createObjectStore('tasks', { keyPath: 'id' });
        taskStore.createIndex('job_id', 'job_id', { unique: false });
        taskStore.createIndex('status', 'status', { unique: false });
      }

      // Create photos store
      if (!database.objectStoreNames.contains('photos')) {
        const photoStore = database.createObjectStore('photos', { keyPath: 'id' });
        photoStore.createIndex('job_id', 'job_id', { unique: false });
        photoStore.createIndex('task_id', 'task_id', { unique: false });
      }

      // Create settings store
      if (!database.objectStoreNames.contains('settings')) {
        database.createObjectStore('settings', { keyPath: 'key' });
      }
    };
  });
}

/**
 * Get the database instance
 */
async function getDB(): Promise<IDBDatabase> {
  if (!db) {
    db = await initDB();
  }
  return db;
}

// ========== JOB OPERATIONS ==========

export async function createJob(job: Omit<Job, 'id' | 'created_at' | 'updated_at'>): Promise<Job> {
  const database = await getDB();
  const id = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const now = Date.now();

  const newJob: Job = {
    ...job,
    id,
    created_at: now,
    updated_at: now,
  };

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(['jobs'], 'readwrite');
    const store = transaction.objectStore('jobs');
    const request = store.add(newJob);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(newJob);
  });
}

export async function getJobs(): Promise<Job[]> {
  const database = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(['jobs'], 'readonly');
    const store = transaction.objectStore('jobs');
    const request = store.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const jobs = request.result.sort((a, b) => b.created_at - a.created_at);
      resolve(jobs);
    };
  });
}

export async function getJob(id: string): Promise<Job | undefined> {
  const database = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(['jobs'], 'readonly');
    const store = transaction.objectStore('jobs');
    const request = store.get(id);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

export async function updateJob(id: string, updates: Partial<Job>): Promise<Job> {
  const database = await getDB();
  const job = await getJob(id);

  if (!job) throw new Error(`Job ${id} not found`);

  const updatedJob: Job = {
    ...job,
    ...updates,
    id, // Ensure id doesn't change
    created_at: job.created_at, // Ensure created_at doesn't change
    updated_at: Date.now(),
  };

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(['jobs'], 'readwrite');
    const store = transaction.objectStore('jobs');
    const request = store.put(updatedJob);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(updatedJob);
  });
}

export async function deleteJob(id: string): Promise<void> {
  const database = await getDB();

  // Delete all tasks and photos associated with this job
  const tasks = await getTasksByJobId(id);
  for (const task of tasks) {
    await deleteTask(task.id);
  }

  const photos = await getPhotosByJobId(id);
  for (const photo of photos) {
    await deletePhoto(photo.id);
  }

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(['jobs'], 'readwrite');
    const store = transaction.objectStore('jobs');
    const request = store.delete(id);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

// ========== TASK OPERATIONS ==========

export async function createTask(task: Omit<Task, 'id' | 'created_at' | 'updated_at'>): Promise<Task> {
  const database = await getDB();
  const id = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const now = Date.now();

  const newTask: Task = {
    ...task,
    id,
    created_at: now,
    updated_at: now,
  };

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(['tasks'], 'readwrite');
    const store = transaction.objectStore('tasks');
    const request = store.add(newTask);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(newTask);
  });
}

export async function getTasks(): Promise<Task[]> {
  const database = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(['tasks'], 'readonly');
    const store = transaction.objectStore('tasks');
    const request = store.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

export async function getTasksByJobId(jobId: string): Promise<Task[]> {
  const database = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(['tasks'], 'readonly');
    const store = transaction.objectStore('tasks');
    const index = store.index('job_id');
    const request = index.getAll(jobId);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const tasks = request.result.sort((a, b) => b.created_at - a.created_at);
      resolve(tasks);
    };
  });
}

export async function updateTask(id: string, updates: Partial<Task>): Promise<Task> {
  const database = await getDB();

  const getRequest = new Promise<Task>((resolve, reject) => {
    const transaction = database.transaction(['tasks'], 'readonly');
    const store = transaction.objectStore('tasks');
    const request = store.get(id);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      if (!request.result) reject(new Error(`Task ${id} not found`));
      else resolve(request.result);
    };
  });

  const task = await getRequest;

  const updatedTask: Task = {
    ...task,
    ...updates,
    id,
    created_at: task.created_at,
    updated_at: Date.now(),
  };

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(['tasks'], 'readwrite');
    const store = transaction.objectStore('tasks');
    const request = store.put(updatedTask);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(updatedTask);
  });
}

export async function deleteTask(id: string): Promise<void> {
  const database = await getDB();

  // Delete all photos associated with this task
  const photos = await getPhotosByTaskId(id);
  for (const photo of photos) {
    await deletePhoto(photo.id);
  }

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(['tasks'], 'readwrite');
    const store = transaction.objectStore('tasks');
    const request = store.delete(id);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

// ========== PHOTO OPERATIONS ==========

export async function addPhoto(photo: Omit<Photo, 'id' | 'created_at'>): Promise<Photo> {
  const database = await getDB();
  const id = `photo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const now = Date.now();

  const newPhoto: Photo = {
    ...photo,
    id,
    created_at: now,
  };

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(['photos'], 'readwrite');
    const store = transaction.objectStore('photos');
    const request = store.add(newPhoto);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(newPhoto);
  });
}

export async function getPhotosByJobId(jobId: string): Promise<Photo[]> {
  const database = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(['photos'], 'readonly');
    const store = transaction.objectStore('photos');
    const index = store.index('job_id');
    const request = index.getAll(jobId);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const photos = request.result.sort((a, b) => b.created_at - a.created_at);
      resolve(photos);
    };
  });
}

export async function getPhotosByTaskId(taskId: string): Promise<Photo[]> {
  const database = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(['photos'], 'readonly');
    const store = transaction.objectStore('photos');
    const index = store.index('task_id');
    const request = index.getAll(taskId);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

export async function updatePhotoExtraction(photoId: string, extractedInfo: any): Promise<Photo> {
  const database = await getDB();

  const getRequest = new Promise<Photo>((resolve, reject) => {
    const transaction = database.transaction(['photos'], 'readonly');
    const store = transaction.objectStore('photos');
    const request = store.get(photoId);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      if (!request.result) reject(new Error(`Photo ${photoId} not found`));
      else resolve(request.result);
    };
  });

  const photo = await getRequest;

  const updatedPhoto: Photo = {
    ...photo,
    extracted_info: extractedInfo,
  };

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(['photos'], 'readwrite');
    const store = transaction.objectStore('photos');
    const request = store.put(updatedPhoto);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(updatedPhoto);
  });
}

export async function deletePhoto(id: string): Promise<void> {
  const database = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(['photos'], 'readwrite');
    const store = transaction.objectStore('photos');
    const request = store.delete(id);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

// ========== SETTINGS OPERATIONS ==========

export async function getSettings(): Promise<AppSettings> {
  const database = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(['settings'], 'readonly');
    const store = transaction.objectStore('settings');
    const request = store.get('app');

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      resolve(request.result || { last_updated: Date.now() });
    };
  });
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const database = await getDB();
  const settingsToSave = {
    key: 'app',
    ...settings,
    last_updated: Date.now(),
  };

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(['settings'], 'readwrite');
    const store = transaction.objectStore('settings');
    const request = store.put(settingsToSave);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}
