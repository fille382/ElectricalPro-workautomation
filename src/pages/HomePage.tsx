import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useJobs, useSavedContacts } from '../hooks/useIndexedDB';
import { saveContactsFromJob } from '../utils/db';
import { useTranslation } from '../contexts/I18nContext';
import { useAuth } from '../contexts/AuthContext';
import { getPBSync } from '../utils/pocketbase';
import JobForm from '../components/JobForm';
import MapTileBackground from '../components/MapTileBackground';

interface HomePageProps {
  apiKey: string | null;
}

export default function HomePage({ apiKey }: HomePageProps) {
  const { jobs, loading, createJob } = useJobs();
  const { savedContacts, refresh: refreshContacts } = useSavedContacts();
  const { t } = useTranslation();
  const { isAuthenticated, isOnline } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [sharedJobCount, setSharedJobCount] = useState(0);

  // Load shared job count when authenticated
  useEffect(() => {
    if (!isAuthenticated || !isOnline) {
      setSharedJobCount(0);
      return;
    }
    const pb = getPBSync();
    if (!pb) return;

    (async () => {
      try {
        const result = await pb.collection('job_shares').getList(1, 1, {
          filter: `user_id = "${pb.authStore.record?.id}"`,
        });
        setSharedJobCount(result.totalItems);
      } catch {
        // Silently ignore - PB might not have this collection yet
      }
    })();
  }, [isAuthenticated, isOnline]);

  const handleCreateJob = async (jobData: any) => {
    try {
      await createJob({
        ...jobData,
        status: 'active' as const,
      });
      // Auto-save contacts to global address book
      if (jobData.contacts?.length > 0 && jobData.address) {
        await saveContactsFromJob(jobData.contacts, jobData.address);
        refreshContacts();
      }
      setShowForm(false);
      toast.success(t('toast.jobCreated'));
    } catch {
      toast.error(t('toast.jobCreateFailed'));
    }
  };

  const activeJobs = jobs.filter((j) => j.status === 'active');
  const completedJobs = jobs.filter((j) => j.status === 'completed');

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {!apiKey && (
        <div className="mb-6 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <div className="flex gap-3">
            <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <div>
              <h3 className="font-medium text-yellow-900 dark:text-yellow-200">{t('home.apiKeyWarningTitle')}</h3>
              <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                {t('home.apiKeyWarningText').split('{link}')[0]}
                <Link to="/settings" className="underline font-medium hover:opacity-75">
                  {t('header.settings')}
                </Link>
                {t('home.apiKeyWarningText').split('{link}')[1] || ''}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-blue-900 dark:text-gray-100">{t('home.electricalJobs')}</h1>
        <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2 transition-all duration-200 hover:scale-105 hover:shadow-lg hover:shadow-blue-500/25 active:scale-95">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t('home.newJob')}
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white/95 dark:bg-gray-800/95 rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-blue-900 dark:text-gray-100">{t('home.createNewJob')}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6">
              <JobForm savedContacts={savedContacts} onSubmit={handleCreateJob} onCancel={() => setShowForm(false)} />
            </div>
          </div>
        </div>
      )}

      <div className="mb-8">
        <h2 className="text-xl font-bold text-blue-900 dark:text-gray-100 mb-4">
          {t('home.activeJobs')} {activeJobs.length > 0 && `(${activeJobs.length})`}
        </h2>
        {activeJobs.length === 0 ? (
          <div className="card text-center py-12">
            <svg className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-gray-500 dark:text-gray-400">{t('home.noActiveJobs')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeJobs.map((job) => (
              <Link key={job.id} to={`/job/${job.id}`} className="card cursor-pointer group transition-all duration-300 ease-out hover:shadow-xl hover:shadow-blue-500/10 hover:-translate-y-1 hover:border-blue-500/30 dark:hover:border-blue-400/30 border border-transparent overflow-hidden !p-0">
                {job.lat && job.lon ? (
                  <MapTileBackground lat={job.lat} lon={job.lon} className="h-20">
                    <div className="absolute inset-0 bg-gradient-to-t from-white/80 dark:from-gray-800/80 via-transparent to-transparent" />
                    <span className="badge-primary absolute top-2 right-2">{t('home.active')}</span>
                  </MapTileBackground>
                ) : (
                  <div className="h-2 bg-gradient-to-r from-blue-500 to-blue-600 rounded-t-lg" />
                )}
                <div className="p-4">
                  <div className="flex items-start justify-between mb-1">
                    <div className="flex-1">
                      <h3 className="font-bold text-blue-900 dark:text-gray-100 group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors duration-300 line-clamp-2">{job.name}</h3>
                      {job.contacts?.[0] && <p className="text-sm text-gray-500 dark:text-gray-400">{job.contacts[0].name}{job.contacts.length > 1 ? ` +${job.contacts.length - 1}` : ''}</p>}
                      <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-1">{job.address}</p>
                    </div>
                    {!(job.lat && job.lon) && <span className="badge-primary ml-2 flex-shrink-0">{t('home.active')}</span>}
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mb-2">{job.description}</p>
                  <div className="text-xs text-gray-500">{new Date(job.created_at).toLocaleDateString()}</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {isAuthenticated && sharedJobCount > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-bold text-blue-900 dark:text-gray-100 mb-4">
            {t('share.sharedWithMe')} ({sharedJobCount})
          </h2>
          <div className="card text-center py-8">
            <svg className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              {sharedJobCount} {sharedJobCount === 1 ? 'job' : 'jobs'}
            </p>
          </div>
        </div>
      )}

      {completedJobs.length > 0 && (
        <div>
          <h2 className="text-xl font-bold text-blue-900 dark:text-gray-100 mb-4">
            {t('home.completedJobs')} ({completedJobs.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {completedJobs.map((job) => (
              <Link key={job.id} to={`/job/${job.id}`} className="card opacity-75 cursor-pointer group transition-all duration-300 ease-out hover:opacity-100 hover:shadow-lg hover:shadow-green-500/10 hover:-translate-y-1 hover:border-green-500/20 dark:hover:border-green-400/20 border border-transparent">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="font-bold text-gray-600 dark:text-gray-400 group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors duration-300 line-clamp-2">{job.name}</h3>
                    <p className="text-sm text-gray-500 line-clamp-1">{job.address}</p>
                  </div>
                  <span className="badge-success ml-2 flex-shrink-0">{t('home.done')}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
