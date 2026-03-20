import { useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useJobs, useTasks, usePhotos, useSavedContacts, useShoppingList } from '../hooks/useIndexedDB';
import { saveContactsFromJob } from '../utils/db';
import { useClaude } from '../hooks/useClaude';
import { useTranslation } from '../contexts/I18nContext';
import JobForm from '../components/JobForm';
import TaskForm from '../components/TaskForm';
import CameraCapture from '../components/CameraCapture';
import PhotoGallery from '../components/PhotoGallery';
import JobChat from '../components/JobChat';
import ShoppingList from '../components/ShoppingList';
import type { Task } from '../types';
import { computeImageHash } from '../utils/imageHash';

interface JobDetailPageProps {
  apiKey: string | null;
}

export default function JobDetailPage({ apiKey }: JobDetailPageProps) {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const { t, language } = useTranslation();
  const { jobs, updateJob, deleteJob } = useJobs();
  const { tasks, createTask, updateTask, deleteTask } = useTasks(jobId || null);
  const { photos, addPhoto, updatePhotoExtraction, deletePhoto } = usePhotos(jobId || null);
  const { analyzePanel, explainTask } = useClaude(apiKey);
  const { savedContacts, refresh: refreshContacts } = useSavedContacts();
  const { items: shoppingItems, addItem: addShoppingItem, updateItem: updateShoppingItem, deleteItem: deleteShoppingItem } = useShoppingList(jobId || null);

  const [activeTab, setActiveTab] = useState<'tasks' | 'shopping'>('tasks');
  const [showEditJob, setShowEditJob] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [analyzingPhotoIds, setAnalyzingPhotoIds] = useState<Set<string>>(new Set());
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [taskExplanations, setTaskExplanations] = useState<Record<string, { explanation: string | null; loading: boolean; subtaskIds?: string[] }>>({});
  const groupRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const handleShowTasks = useCallback((photoId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(photoId)) {
        next.delete(photoId);
      } else {
        next.add(photoId);
        requestAnimationFrame(() => {
          groupRefs.current[photoId]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
      return next;
    });
  }, []);

  const job = jobs.find((j) => j.id === jobId);

  if (!job) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="card text-center py-12">
          <p className="text-gray-500 dark:text-gray-400 mb-4">{t('job.notFound')}</p>
          <button onClick={() => navigate('/')} className="btn-primary">{t('job.backToJobs')}</button>
        </div>
      </div>
    );
  }

  const topLevelTasks = tasks.filter((tk) => !tk.parent_task_id);
  const completedTasks = topLevelTasks.filter((tk) => tk.status === 'completed');
  const activeTasks = topLevelTasks.filter((tk) => tk.status !== 'completed');
  const getSubTasks = (parentId: string) => tasks.filter((tk) => tk.parent_task_id === parentId);

  // Group active tasks by source photo
  const taskGroups = (() => {
    const groups: { key: string; label: string; tasks: typeof activeTasks }[] = [];
    const byPhoto = new Map<string, typeof activeTasks>();
    const manual: typeof activeTasks = [];

    for (const task of activeTasks) {
      if (task.source_photo_id) {
        const existing = byPhoto.get(task.source_photo_id) || [];
        existing.push(task);
        byPhoto.set(task.source_photo_id, existing);
      } else {
        manual.push(task);
      }
    }

    if (manual.length > 0) {
      groups.push({ key: 'manual', label: t('job.manualTasks'), tasks: manual });
    }

    for (const [photoId, photoTasks] of byPhoto) {
      const photo = photos.find((p) => p.id === photoId);
      const label = photo?.extracted_info?.component_type || t('job.photoTasks');
      groups.push({ key: photoId, label, tasks: photoTasks });
    }

    return groups;
  })();

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Count tasks per photo for the gallery badges
  const photoTaskCounts: Record<string, number> = {};
  for (const task of activeTasks) {
    if (task.source_photo_id) {
      photoTaskCounts[task.source_photo_id] = (photoTaskCounts[task.source_photo_id] || 0) + 1;
    }
  }

  const handleDeleteJob = async () => {
    if (confirm(t('job.confirmDelete'))) {
      try {
        await deleteJob(job.id);
        toast.success(t('toast.jobDeleted'));
        navigate('/');
      } catch {
        toast.error(t('toast.jobDeleteFailed'));
      }
    }
  };

  const runAnalysis = async (photoId: string, imageBlob: Blob) => {
    if (!apiKey) return;

    console.log('[AUTO] Starting analysis for photo:', photoId);
    setAnalyzingPhotoIds((prev) => new Set(prev).add(photoId));

    try {
      const previousPhotos = photos
        .filter((p) => p.id !== photoId && p.extracted_info)
        .map((p) => ({
          component_type: p.extracted_info?.component_type,
          condition: p.extracted_info?.condition,
          recommendations: p.extracted_info?.recommendations,
        }));

      const analysis = await analyzePanel(imageBlob, language, {
        name: job.name,
        description: job.description || undefined,
        address: job.address || undefined,
      }, previousPhotos);
      console.log('[AUTO] Analysis complete, saving...');
      await updatePhotoExtraction(photoId, analysis);

      if (analysis.recommendations && analysis.recommendations.length > 0) {
        console.log('[AUTO] Creating', analysis.recommendations.length, 'tasks from recommendations');
        for (const rec of analysis.recommendations) {
          try {
            await createTask({
              job_id: job.id,
              title: rec,
              description: t('job.autoGenerated'),
              status: 'pending',
              notes: '',
              source_photo_id: photoId,
            });
          } catch (err) {
            console.error('[AUTO] Failed to create task:', err);
          }
        }
        toast.success(t('toast.photoAnalyzedWithTasks', { count: analysis.recommendations.length }));
      } else {
        toast.success(t('toast.photoAnalyzed'));
      }
    } catch (error) {
      console.error('[AUTO] Analysis failed:', error);
      const msg = error instanceof Error ? error.message : 'Unknown error';
      toast.error(t('toast.analysisFailed', { msg }));
    } finally {
      setAnalyzingPhotoIds((prev) => {
        const next = new Set(prev);
        next.delete(photoId);
        return next;
      });
    }
  };

  const handleCapturePhoto = async (blob: Blob) => {
    try {
      // Compute hash for duplicate detection (fails gracefully)
      const hash = await computeImageHash(blob);

      if (hash) {
        const duplicate = photos.find((p) => p.image_hash === hash);
        if (duplicate) {
          const proceed = confirm(t('toast.duplicatePhotoWarning'));
          if (!proceed) {
            setShowCamera(false);
            return;
          }
        }
      }

      const newPhoto = await addPhoto({ job_id: job.id, image_data: blob, image_hash: hash, user_notes: '' });
      setShowCamera(false);
      toast.success(t('toast.photoUploaded'));
      if (apiKey) runAnalysis(newPhoto.id, blob);
    } catch (err) {
      console.error('[Photo] Failed to save photo:', err);
      toast.error(t('toast.photoSaveFailed'));
    }
  };

  const handleManualAnalyze = async (photoId: string, analysis: any) => {
    return updatePhotoExtraction(photoId, analysis);
  };

  const handleDeletePhoto = async (photoId: string) => {
    try {
      await deletePhoto(photoId);
      toast.success(t('toast.photoRemoved'));
    } catch {
      toast.error(t('toast.photoRemoveFailed'));
    }
  };

  const handleExplainTask = async (task: Task) => {
    // Toggle collapse if already expanded
    if (expandedTaskId === task.id) {
      setExpandedTaskId(null);
      return;
    }

    setExpandedTaskId(task.id);

    // Already fetched — just expand
    if (taskExplanations[task.id]?.explanation) return;

    if (!apiKey) {
      toast.error(t('toast.addApiKeyInSettings'));
      return;
    }
    if (!task.source_photo_id) return;

    const sourcePhoto = photos.find((p) => p.id === task.source_photo_id);
    if (!sourcePhoto?.image_data) {
      toast.error(t('toast.sourcePhotoNotFound'));
      return;
    }

    setTaskExplanations((prev) => ({ ...prev, [task.id]: { explanation: null, loading: true } }));

    try {
      const result = await explainTask(task.title, sourcePhoto.image_data, language, {
        name: job.name,
        description: job.description || undefined,
        address: job.address || undefined,
      });

      // Create sub-tasks from the AI response
      const subtaskIds: string[] = [];
      if (result.subtasks && result.subtasks.length > 0) {
        for (const subtaskTitle of result.subtasks) {
          try {
            const newTask = await createTask({
              job_id: job.id,
              title: subtaskTitle,
              description: '',
              status: 'pending',
              notes: '',
              source_photo_id: task.source_photo_id,
              parent_task_id: task.id,
            });
            subtaskIds.push(newTask.id);
          } catch (err) {
            console.error('[AI] Failed to create subtask:', err);
          }
        }
      }

      setTaskExplanations((prev) => ({
        ...prev,
        [task.id]: { explanation: result.explanation, loading: false, subtaskIds },
      }));
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      toast.error(t('toast.explainFailed', { msg }));
      setTaskExplanations((prev) => {
        const next = { ...prev };
        delete next[task.id];
        return next;
      });
      setExpandedTaskId(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Job Header */}
      <div className="card mb-6 bg-gradient-to-r from-blue-50 to-blue-100 dark:from-gray-800 dark:to-gray-750 border-l-4 border-blue-600">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-blue-900 dark:text-gray-100 mb-2">{job.name}</h1>
            <div className="flex flex-col gap-2 text-gray-700 dark:text-gray-300">
              {job.address && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                >
                  <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                  </svg>
                  <span className="underline underline-offset-2">{job.address}</span>
                </a>
              )}
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {t('job.created')} {new Date(job.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowEditJob(true)} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              {t('job.edit')}
            </button>
            <button onClick={handleDeleteJob} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
              {t('job.delete')}
            </button>
          </div>
        </div>

        {job.description && (
          <p className="text-gray-700 dark:text-gray-300 mt-4 p-3 bg-white dark:bg-gray-700 bg-opacity-50 rounded">{job.description}</p>
        )}

        {job.contacts && job.contacts.length > 0 && (
          <div className="mt-4 p-3 bg-white dark:bg-gray-700 bg-opacity-50 rounded">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">{t('job.contact')}</p>
            <div className="space-y-2">
              {job.contacts.map((contact) => (
                <div key={contact.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-700 dark:text-gray-300">
                  <span className="flex items-center gap-1.5">
                    <span className="px-1.5 py-0.5 text-xs font-medium bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded capitalize">
                      {t(`jobForm.role${contact.role.charAt(0).toUpperCase()}${contact.role.slice(1)}` as any) || contact.role}
                    </span>
                    <span className="font-medium">{contact.name}</span>
                  </span>
                  {contact.phone && (
                    <a href={`tel:${contact.phone}`} className="flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                      <svg className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                      <span className="underline underline-offset-2">{contact.phone}</span>
                    </a>
                  )}
                  {contact.email && (
                    <a href={`mailto:${contact.email}`} className="flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                      <svg className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      <span className="underline underline-offset-2">{contact.email}</span>
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 flex items-center gap-4">
          <div className="text-sm">
            <span className="text-gray-700 dark:text-gray-300">{t('job.tasksLabel')} </span>
            <span className="font-bold text-blue-900 dark:text-gray-100">{completedTasks.length}/{topLevelTasks.length}</span>
          </div>
          <div className="flex-1 h-2 bg-gray-300 dark:bg-gray-600 rounded-full overflow-hidden">
            <div className="h-full bg-green-600 transition-all duration-300" style={{ width: topLevelTasks.length > 0 ? `${(completedTasks.length / topLevelTasks.length) * 100}%` : '0%' }} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex gap-1 bg-gray-200 dark:bg-gray-700 rounded-lg p-1">
                <button
                  onClick={() => setActiveTab('tasks')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'tasks' ? 'bg-white dark:bg-gray-600 text-blue-900 dark:text-gray-100 shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'}`}
                >
                  {t('job.tasks')} ({topLevelTasks.length})
                </button>
                <button
                  onClick={() => setActiveTab('shopping')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${activeTab === 'shopping' ? 'bg-white dark:bg-gray-600 text-blue-900 dark:text-gray-100 shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'}`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
                  </svg>
                  {t('shopping.title')} ({shoppingItems.length})
                </button>
              </div>
              {activeTab === 'tasks' && (
                <button onClick={() => setShowAddTask(true)} className="btn-primary text-sm flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  {t('job.addTask')}
                </button>
              )}
            </div>

            {activeTab === 'shopping' && (
              <ShoppingList
                items={shoppingItems}
                onToggle={(id, checked) => updateShoppingItem(id, { checked })}
                onDelete={deleteShoppingItem}
                onUpdateQuantity={(id, quantity) => updateShoppingItem(id, { quantity })}
              />
            )}

            {activeTab === 'tasks' && (activeTasks.length === 0 && completedTasks.length === 0 ? (
              <div className="card text-center py-8 text-gray-500 dark:text-gray-400">
                <p>{t('job.noTasks')}</p>
              </div>
            ) : (
              <>
                {taskGroups.length > 0 && (
                  <div className="space-y-4 mb-6">
                    {taskGroups.map((group) => {
                      const isExpanded = expandedGroups.has(group.key);
                      const doneInGroup = group.tasks.filter((tk) => tk.status === 'completed').length;
                      const activeCount = group.tasks.length - doneInGroup;

                      return (
                        <div key={group.key} ref={(el) => { groupRefs.current[group.key] = el; }}>
                          <button
                            onClick={() => toggleGroup(group.key)}
                            className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                          >
                            <svg className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                            <span className="capitalize">{group.label}</span>
                            <span className="text-gray-400 dark:text-gray-500 font-normal">({activeCount})</span>
                          </button>

                          {isExpanded && (
                            <div className="space-y-2">
                              {group.tasks.map((task) => {
                                const isExpanded = expandedTaskId === task.id;
                                const explainState = taskExplanations[task.id];
                                const canExpand = !!task.source_photo_id && !!apiKey;
                                const hasExplanation = !!explainState?.explanation;

                                return (
                                  <div key={task.id} className={`card hover:shadow-md transition-shadow ${hasExplanation ? 'border-l-4 border-l-green-500 dark:border-l-green-400' : ''}`}>
                                    <div className="flex items-start gap-3">
                                      <input type="checkbox" checked={task.status === 'completed'} onChange={(e) => updateTask(task.id, { status: e.target.checked ? 'completed' : 'pending' })} className="mt-1 cursor-pointer" />
                                      <div
                                        className={`flex-1 min-w-0 ${canExpand ? 'cursor-pointer' : ''}`}
                                        onClick={() => canExpand && handleExplainTask(task)}
                                      >
                                        <div className="flex items-center gap-2">
                                          <h3 className="font-medium text-blue-900 dark:text-gray-100">{task.title}</h3>
                                          {canExpand && (
                                            <svg className={`w-4 h-4 ${hasExplanation ? 'text-green-500 dark:text-green-400' : 'text-blue-500 dark:text-blue-400'} transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                            </svg>
                                          )}
                                        </div>
                                        {task.description && <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{task.description}</p>}
                                        {task.notes && <p className="text-sm text-gray-500 dark:text-gray-500 mt-2 italic">{task.notes}</p>}
                                      </div>
                                      <button onClick={() => { deleteTask(task.id); if (expandedTaskId === task.id) setExpandedTaskId(null); setTaskExplanations((prev) => { const next = { ...prev }; delete next[task.id]; return next; }); }} className="text-red-600 hover:text-red-700 transition-colors flex-shrink-0">
                                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                          <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                                        </svg>
                                      </button>
                                    </div>

                                    {/* Inline AI explanation + sub-tasks */}
                                    {isExpanded && (
                                      <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                                        {explainState?.loading ? (
                                          <div className="flex items-center gap-3 py-4">
                                            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                                            <p className="text-sm text-gray-600 dark:text-gray-400">{t('job.analyzingWithPhoto')}</p>
                                          </div>
                                        ) : explainState?.explanation ? (
                                          <>
                                            <div className="text-sm text-gray-700 dark:text-gray-300 space-y-2">
                                              {explainState.explanation.split('\n').map((line, i) => (
                                                line.trim() === '' ? <div key={i} className="h-1" /> : <p key={i}>{line}</p>
                                              ))}
                                            </div>

                                            {/* Sub-tasks checklist */}
                                            {(() => {
                                              const subtasks = getSubTasks(task.id);
                                              if (subtasks.length === 0) return null;
                                              const doneCount = subtasks.filter((st) => st.status === 'completed').length;
                                              return (
                                                <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-600">
                                                  <div className="flex items-center justify-between mb-2">
                                                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{t('job.tasks')} ({doneCount}/{subtasks.length})</p>
                                                  </div>
                                                  <div className="space-y-1.5">
                                                    {subtasks.map((st) => (
                                                      <label key={st.id} className="flex items-center gap-2 py-1 px-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors">
                                                        <input
                                                          type="checkbox"
                                                          checked={st.status === 'completed'}
                                                          onChange={(e) => { e.stopPropagation(); updateTask(st.id, { status: e.target.checked ? 'completed' : 'pending' }); }}
                                                          className="cursor-pointer flex-shrink-0"
                                                        />
                                                        <span className={`text-sm ${st.status === 'completed' ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-300'}`}>
                                                          {st.title}
                                                        </span>
                                                      </label>
                                                    ))}
                                                  </div>
                                                </div>
                                              );
                                            })()}
                                          </>
                                        ) : null}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {completedTasks.length > 0 && (
                  <div>
                    <button
                      onClick={() => setShowCompleted(!showCompleted)}
                      className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400 mb-2 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
                    >
                      <svg className={`w-4 h-4 transition-transform ${showCompleted ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      {t('job.completed')} ({completedTasks.length})
                    </button>
                    {showCompleted && (
                      <div className="space-y-2 opacity-60">
                        {completedTasks.map((task) => (
                          <div key={task.id} className="card">
                            <div className="flex items-center gap-3">
                              <input type="checkbox" checked={true} onChange={() => updateTask(task.id, { status: 'pending' })} className="cursor-pointer" />
                              <div className="flex-1">
                                <h3 className="font-medium line-through text-gray-600 dark:text-gray-400">{task.title}</h3>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-blue-900 dark:text-gray-100">{t('job.photos')}</h2>
            <button onClick={() => setShowCamera(true)} className="btn-primary text-sm flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              </svg>
              {t('job.photo')}
            </button>
          </div>

          {photos.length === 0 ? (
            <div className="card text-center py-8 text-gray-500 dark:text-gray-400">
              <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p>{t('job.noPhotos')}</p>
            </div>
          ) : (
            <PhotoGallery photos={photos} apiKey={apiKey} onAnalyze={handleManualAnalyze} onDelete={handleDeletePhoto} analyzingPhotoIds={analyzingPhotoIds} jobContext={{ name: job.name, description: job.description || undefined, address: job.address || undefined }} onShowTasks={handleShowTasks} photoTaskCounts={photoTaskCounts} />
          )}
        </div>
      </div>

      {/* Modals */}
      {showEditJob && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 flex items-center justify-center p-4" onClick={() => setShowEditJob(false)}>
          <div className="bg-white/95 dark:bg-gray-800/95 rounded-lg shadow-xl w-full max-w-md max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex-shrink-0 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between rounded-t-lg">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{t('job.editJob')}</h2>
              <button onClick={() => setShowEditJob(false)} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 overflow-y-auto">
              <JobForm
                job={job}
                savedContacts={savedContacts}
                onSubmit={async (data) => {
                  try {
                    await updateJob(job.id, data);
                    // Auto-save contacts to global address book
                    if (data.contacts?.length && data.address) {
                      await saveContactsFromJob(data.contacts, data.address);
                      refreshContacts();
                    }
                    setShowEditJob(false);
                    toast.success(t('toast.jobUpdated'));
                  } catch {
                    toast.error(t('toast.jobUpdateFailed'));
                  }
                }}
                onCancel={() => setShowEditJob(false)}
              />
            </div>
          </div>
        </div>
      )}

      {showAddTask && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 flex items-center justify-center p-4" onClick={() => setShowAddTask(false)}>
          <div className="bg-white/95 dark:bg-gray-800/95 rounded-lg shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{t('job.addTask')}</h2>
              <button onClick={() => setShowAddTask(false)} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6">
              <TaskForm
                jobId={job.id}
                onSubmit={async (data) => {
                  try {
                    await createTask(data);
                    setShowAddTask(false);
                    toast.success(t('toast.taskAdded'));
                  } catch {
                    toast.error(t('toast.taskAddFailed'));
                  }
                }}
                onCancel={() => setShowAddTask(false)}
              />
            </div>
          </div>
        </div>
      )}

      {showCamera && <CameraCapture onCapture={handleCapturePhoto} onClose={() => setShowCamera(false)} />}

      <JobChat jobId={job.id} apiKey={apiKey} job={job} tasks={tasks} photos={photos} onUpdateTask={updateTask} onCreateTask={createTask} onDeleteTask={deleteTask} onAddShoppingItem={addShoppingItem} onUpdateShoppingItem={updateShoppingItem} onDeleteShoppingItem={deleteShoppingItem} shoppingItems={shoppingItems} />
    </div>
  );
}
