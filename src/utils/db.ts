import type { Job, Task, Photo, AppSettings, SavedContact, JobContact } from '../types';

const DB_NAME = 'electrician_app';
const DB_VERSION = 2;

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

      // Create saved contacts store (global address book)
      if (!database.objectStoreNames.contains('saved_contacts')) {
        const contactStore = database.createObjectStore('saved_contacts', { keyPath: 'id' });
        contactStore.createIndex('name', 'name', { unique: false });
        contactStore.createIndex('role', 'role', { unique: false });
      }
    };
  });
}

const DEMO_JOB_ID = 'demo_job_electricalpro';

/**
 * Seed a demo job if the database has no jobs (first launch / after clear)
 */
async function seedDemoData(database: IDBDatabase): Promise<void> {
  // Step 1: Check if there are any jobs (read-only)
  const hasJobs = await new Promise<boolean>((resolve) => {
    const tx = database.transaction(['jobs'], 'readonly');
    const req = tx.objectStore('jobs').count();
    req.onsuccess = () => resolve(req.result > 0);
    req.onerror = () => resolve(true); // Assume jobs exist on error
  });

  if (hasJobs) return;

  // Step 2: Seed demo data (read-write)
  return new Promise((resolve) => {
    const now = Date.now();
    const tx = database.transaction(['jobs', 'tasks'], 'readwrite');

    tx.objectStore('jobs').add({
      id: DEMO_JOB_ID,
      name: 'Elcentral byte — Villa Ekström',
      address: 'Björkvägen 12, 752 37 Uppsala',
      description: 'Byte av elcentral från 1970-tal till modern 3-fas central med jordfelsbrytare. Inkluderar dragning av ny matarledning från mätarskåp och installation av överspänningsskydd.',
      contacts: [
        { id: 'demo_c1', name: 'Anna Ekström', phone: '070-123 45 67', email: 'anna.ekstrom@email.se', role: 'Kund' },
        { id: 'demo_c2', name: 'Erik Johansson', phone: '073-987 65 43', email: '', role: 'Elektriker' },
        { id: 'demo_c3', name: 'Lundbergs El AB', phone: '018-12 34 56', email: 'info@lundbergsel.se', role: 'Företag' },
      ],
      status: 'active',
      created_at: now,
      updated_at: now,
    } as Job);

    const taskStore = tx.objectStore('tasks');
    const demoTasks: Task[] = [
      { id: 'demo_t1', job_id: DEMO_JOB_ID, title: 'Stäng av strömmen vid mätarskåp', description: 'Kontakta nätägaren för frånkoppling om nödvändigt', status: 'pending', notes: '', created_at: now, updated_at: now },
      { id: 'demo_t2', job_id: DEMO_JOB_ID, title: 'Demontera gamla elcentralen', description: 'Dokumentera befintlig koppling med foto innan demontering', status: 'pending', notes: '', created_at: now, updated_at: now },
      { id: 'demo_t3', job_id: DEMO_JOB_ID, title: 'Montera ny central och jordfelsbrytare', description: 'Hager VU36NW med 4st jordfelsbrytare 30mA', status: 'pending', notes: '', created_at: now, updated_at: now },
      { id: 'demo_t4', job_id: DEMO_JOB_ID, title: 'Installera överspänningsskydd', description: 'Typ 2 överspänningsskydd vid inkommande', status: 'pending', notes: '', created_at: now, updated_at: now },
      { id: 'demo_t5', job_id: DEMO_JOB_ID, title: 'Mätning och protokoll', description: 'Isolationsmätning, skyddsjordmätning, kontroll av jordfelsbrytare', status: 'pending', notes: '', created_at: now, updated_at: now },
    ];
    for (const task of demoTasks) taskStore.add(task);

    tx.oncomplete = () => { console.log('[DB] Demo job seeded'); resolve(); };
    tx.onerror = () => resolve();
  });
}

/**
 * Get the database instance
 */
async function getDB(): Promise<IDBDatabase> {
  if (!db) {
    db = await initDB();
    await seedDemoData(db);
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

// ========== SAVED CONTACTS (Global Address Book) ==========

export async function getSavedContacts(): Promise<SavedContact[]> {
  const database = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(['saved_contacts'], 'readonly');
    const store = transaction.objectStore('saved_contacts');
    const request = store.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const contacts = request.result.sort((a: SavedContact, b: SavedContact) => b.updated_at - a.updated_at);
      resolve(contacts);
    };
  });
}

export async function createSavedContact(contact: Omit<SavedContact, 'id' | 'created_at' | 'updated_at'>): Promise<SavedContact> {
  const database = await getDB();
  const id = `contact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const now = Date.now();

  const newContact: SavedContact = {
    ...contact,
    id,
    created_at: now,
    updated_at: now,
  };

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(['saved_contacts'], 'readwrite');
    const store = transaction.objectStore('saved_contacts');
    const request = store.add(newContact);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(newContact);
  });
}

export async function updateSavedContact(id: string, updates: Partial<SavedContact>): Promise<SavedContact> {
  const database = await getDB();

  const existing = await new Promise<SavedContact>((resolve, reject) => {
    const transaction = database.transaction(['saved_contacts'], 'readonly');
    const store = transaction.objectStore('saved_contacts');
    const request = store.get(id);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      if (!request.result) reject(new Error(`Contact ${id} not found`));
      else resolve(request.result);
    };
  });

  const updated: SavedContact = {
    ...existing,
    ...updates,
    id,
    created_at: existing.created_at,
    updated_at: Date.now(),
  };

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(['saved_contacts'], 'readwrite');
    const store = transaction.objectStore('saved_contacts');
    const request = store.put(updated);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(updated);
  });
}

export async function deleteSavedContact(id: string): Promise<void> {
  const database = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(['saved_contacts'], 'readwrite');
    const store = transaction.objectStore('saved_contacts');
    const request = store.delete(id);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

/**
 * Auto-save job contacts to the global address book.
 * Upserts by name+role: updates phone/email/address if exists, creates if not.
 */
export async function saveContactsFromJob(jobContacts: JobContact[], address: string): Promise<void> {
  if (!jobContacts || jobContacts.length === 0) return;

  const allSaved = await getSavedContacts();
  const normalizedAddress = address.trim().toLowerCase();

  for (const jc of jobContacts) {
    if (!jc.name.trim()) continue;

    const nameNorm = jc.name.trim().toLowerCase();
    const roleNorm = jc.role.trim().toLowerCase();

    // Find existing by name + role
    const existing = allSaved.find(
      (sc) => sc.name.trim().toLowerCase() === nameNorm && sc.role.trim().toLowerCase() === roleNorm
    );

    if (existing) {
      // Update phone/email and append address if new
      const addresses = [...existing.addresses];
      if (normalizedAddress && !addresses.map((a) => a.toLowerCase()).includes(normalizedAddress)) {
        addresses.push(address.trim());
      }
      await updateSavedContact(existing.id, {
        phone: jc.phone || existing.phone,
        email: jc.email || existing.email,
        addresses,
      });
    } else {
      // Create new saved contact
      await createSavedContact({
        name: jc.name.trim(),
        phone: jc.phone,
        email: jc.email,
        role: jc.role,
        addresses: normalizedAddress ? [address.trim()] : [],
      });
    }
  }
}
