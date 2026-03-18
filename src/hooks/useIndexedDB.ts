import { useEffect, useState } from 'react';
import * as db from '../utils/db';
import type { Job, Task, Photo, SavedContact, ChatMessage, ShoppingItem } from '../types';

/**
 * Hook to manage jobs
 */
export function useJobs() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadJobs = async () => {
    try {
      setLoading(true);
      const result = await db.getJobs();
      setJobs(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load jobs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadJobs();
  }, []);

  const createJob = async (jobData: Omit<Job, 'id' | 'created_at' | 'updated_at'>) => {
    try {
      const newJob = await db.createJob(jobData);
      setJobs((prev) => [newJob, ...prev]);
      return newJob;
    } catch (err) {
      throw err;
    }
  };

  const updateJob = async (id: string, updates: Partial<Job>) => {
    try {
      const updated = await db.updateJob(id, updates);
      setJobs((prev) => prev.map((j) => (j.id === id ? updated : j)));
      return updated;
    } catch (err) {
      throw err;
    }
  };

  const deleteJob = async (id: string) => {
    try {
      await db.deleteJob(id);
      setJobs((prev) => prev.filter((j) => j.id !== id));
    } catch (err) {
      throw err;
    }
  };

  return {
    jobs,
    loading,
    error,
    createJob,
    updateJob,
    deleteJob,
    refresh: loadJobs,
  };
}

/**
 * Hook to manage tasks for a specific job
 */
export function useTasks(jobId: string | null) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTasks = async () => {
    if (!jobId) {
      setTasks([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const result = await db.getTasksByJobId(jobId);
      setTasks(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, [jobId]);

  const createTask = async (taskData: Omit<Task, 'id' | 'created_at' | 'updated_at'>) => {
    try {
      const newTask = await db.createTask(taskData);
      setTasks((prev) => [newTask, ...prev]);
      return newTask;
    } catch (err) {
      throw err;
    }
  };

  const updateTask = async (id: string, updates: Partial<Task>) => {
    try {
      const updated = await db.updateTask(id, updates);
      setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
      return updated;
    } catch (err) {
      throw err;
    }
  };

  const deleteTask = async (id: string) => {
    try {
      // Also delete sub-tasks of this parent
      const subtasks = tasks.filter((t) => t.parent_task_id === id);
      for (const st of subtasks) {
        await db.deleteTask(st.id);
      }
      await db.deleteTask(id);
      setTasks((prev) => prev.filter((t) => t.id !== id && t.parent_task_id !== id));
    } catch (err) {
      throw err;
    }
  };

  return {
    tasks,
    loading,
    error,
    createTask,
    updateTask,
    deleteTask,
    refresh: loadTasks,
  };
}

/**
 * Hook to manage photos for a specific job
 */
export function usePhotos(jobId: string | null) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPhotos = async () => {
    if (!jobId) {
      setPhotos([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const result = await db.getPhotosByJobId(jobId);
      setPhotos(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load photos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPhotos();
  }, [jobId]);

  const addPhoto = async (photoData: Omit<Photo, 'id' | 'created_at'>) => {
    try {
      const newPhoto = await db.addPhoto(photoData);
      setPhotos((prev) => [newPhoto, ...prev]);
      return newPhoto;
    } catch (err) {
      throw err;
    }
  };

  const updatePhotoExtraction = async (photoId: string, extractedInfo: any) => {
    try {
      const updated = await db.updatePhotoExtraction(photoId, extractedInfo);
      setPhotos((prev) => prev.map((p) => (p.id === photoId ? updated : p)));
      return updated;
    } catch (err) {
      throw err;
    }
  };

  const deletePhoto = async (id: string) => {
    try {
      await db.deletePhoto(id);
      setPhotos((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      throw err;
    }
  };

  return {
    photos,
    loading,
    error,
    addPhoto,
    updatePhotoExtraction,
    deletePhoto,
    refresh: loadPhotos,
  };
}

/**
 * Hook to manage global saved contacts (address book)
 */
export function useSavedContacts() {
  const [savedContacts, setSavedContacts] = useState<SavedContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadContacts = async () => {
    try {
      setLoading(true);
      const result = await db.getSavedContacts();
      setSavedContacts(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load contacts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadContacts();
  }, []);

  return {
    savedContacts,
    loading,
    error,
    refresh: loadContacts,
  };
}

/**
 * Hook to manage chat messages for a specific job
 */
export function useChat(jobId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);

  const loadMessages = async () => {
    if (!jobId) {
      setMessages([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const result = await db.getChatMessages(jobId);
      setMessages(result);
    } catch (err) {
      console.error('Failed to load chat messages:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMessages();
  }, [jobId]);

  const addMessage = async (msg: Omit<ChatMessage, 'id' | 'created_at'>) => {
    const newMsg = await db.addChatMessage(msg);
    setMessages((prev) => [...prev, newMsg]);
    return newMsg;
  };

  const clearMessages = async () => {
    if (!jobId) return;
    await db.clearChatMessages(jobId);
    setMessages([]);
  };

  return { messages, loading, addMessage, clearMessages, refresh: loadMessages };
}

/**
 * Hook to manage shopping list for a specific job
 */
export function useShoppingList(jobId: string | null) {
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadItems = async () => {
    if (!jobId) { setItems([]); setLoading(false); return; }
    try {
      setLoading(true);
      const result = await db.getShoppingItems(jobId);
      setItems(result);
    } catch (err) {
      console.error('Failed to load shopping list:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadItems(); }, [jobId]);

  const addItem = async (item: Omit<ShoppingItem, 'id' | 'created_at'>) => {
    const newItem = await db.addShoppingItem(item);
    setItems((prev) => [...prev, newItem]);
    return newItem;
  };

  const updateItem = async (id: string, updates: Partial<ShoppingItem>) => {
    const updated = await db.updateShoppingItem(id, updates);
    setItems((prev) => prev.map((i) => (i.id === id ? updated : i)));
    return updated;
  };

  const deleteItem = async (id: string) => {
    await db.deleteShoppingItem(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  return { items, loading, addItem, updateItem, deleteItem, refresh: loadItems };
}
