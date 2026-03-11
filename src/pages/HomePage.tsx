import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useJobs, useSavedContacts } from '../hooks/useIndexedDB';
import { saveContactsFromJob } from '../utils/db';
import { useTranslation } from '../contexts/I18nContext';
import JobForm from '../components/JobForm';

interface HomePageProps {
  apiKey: string | null;
}

export default function HomePage({ apiKey }: HomePageProps) {
  const { jobs, loading, createJob } = useJobs();
  const { savedContacts, refresh: refreshContacts } = useSavedContacts();
  const { t } = useTranslation();
  const [showForm, setShowForm] = useState(false);

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
        <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t('home.newJob')}
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 flex items-center justify-center p-4">
          <div className="bg-white/95 dark:bg-gray-800/95 rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
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
              <Link key={job.id} to={`/job/${job.id}`} className="card hover:shadow-lg transition-shadow cursor-pointer group">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="font-bold text-blue-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-2">{job.name}</h3>
                    {job.contacts?.[0] && <p className="text-sm text-gray-500 dark:text-gray-400">{job.contacts[0].name}{job.contacts.length > 1 ? ` +${job.contacts.length - 1}` : ''}</p>}
                    <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-1">{job.address}</p>
                  </div>
                  <span className="badge-primary ml-2 flex-shrink-0">{t('home.active')}</span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mb-3">{job.description}</p>
                <div className="text-xs text-gray-500">{new Date(job.created_at).toLocaleDateString()}</div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {completedJobs.length > 0 && (
        <div>
          <h2 className="text-xl font-bold text-blue-900 dark:text-gray-100 mb-4">
            {t('home.completedJobs')} ({completedJobs.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {completedJobs.map((job) => (
              <Link key={job.id} to={`/job/${job.id}`} className="card opacity-75 hover:opacity-100 transition-opacity cursor-pointer group">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="font-bold text-gray-600 dark:text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-2">{job.name}</h3>
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
