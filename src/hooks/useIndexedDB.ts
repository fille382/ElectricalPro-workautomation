import { useEffect, useState } from 'react';
import * as db from '../utils/db';
import type { Job, Task, Photo } from '../types';

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
