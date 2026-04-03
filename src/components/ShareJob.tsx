import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../contexts/I18nContext';
import { getPBSync } from '../utils/pocketbase';
import type { JobShare } from '../types';

interface ShareJobProps {
  jobId: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function ShareJob({ jobId, isOpen, onClose }: ShareJobProps) {
  const { isAuthenticated, isOnline, user } = useAuth();
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'viewer' | 'editor'>('viewer');
  const [shares, setShares] = useState<JobShare[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load existing shares when modal opens
  useEffect(() => {
    if (isOpen && isAuthenticated && isOnline) {
      loadShares();
    }
  }, [isOpen, isAuthenticated, isOnline]);

  const loadShares = async () => {
    const pb = getPBSync();
    if (!pb) return;

    try {
      // jobId might be a local ID - try to find the PB record
      let pbJobId = jobId;
      try {
        const jobs = await pb.collection('jobs').getFullList({ filter: `id = "${jobId}"` });
        if (jobs.length === 0) {
          // Not a PB ID - no shares possible yet (job not synced)
          return;
        }
        pbJobId = jobs[0].id;
      } catch { return; }

      const records = await pb.collection('job_shares').getFullList({
        filter: `job = "${pbJobId}"`,
      });
      setShares(
        records.map((r) => ({
          id: r.id,
          pb_id: r.id,
          job_id: r.job,
          user_id: r.user,
          user_email: r.user_email,
          user_name: r.user_name || '',
          role: r.role as 'viewer' | 'editor',
          created_at: new Date(r.created).getTime(),
        }))
      );
    } catch (err) {
      console.error('[ShareJob] Failed to load shares:', err);
    }
  };

  const handleShare = async () => {
    if (!email.trim()) return;

    const pb = getPBSync();
    if (!pb || !user) return;

    setLoading(true);
    setError(null);

    try {
      // Look up the user by email
      const users = await pb.collection('users').getFullList({
        filter: `email = "${email.trim()}"`,
      });

      if (users.length === 0) {
        setError(t('share.userNotFound'));
        setLoading(false);
        return;
      }

      const targetUser = users[0];

      // Resolve local job ID → PB job ID
      const db = await import('../utils/db');
      const allJobs = await db.getJobs();
      const localJob = allJobs.find(j => j.id === jobId);
      const pbJobId = localJob?.pb_id || jobId;

      if (!localJob?.pb_id) {
        setError('Jobbet har inte synkats ännu. Tryck Sync först.');
        setLoading(false);
        return;
      }

      // Create the share record
      await pb.collection('job_shares').create({
        job: pbJobId,
        user: targetUser.id,
        user_email: targetUser.email,
        role,
      });

      setEmail('');
      await loadShares();
    } catch (err) {
      console.error('[ShareJob] Failed to share:', err);
      setError(err instanceof Error ? err.message : 'Failed to share');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveShare = async (shareId: string) => {
    const pb = getPBSync();
    if (!pb) return;

    try {
      await pb.collection('job_shares').delete(shareId);
      setShares((prev) => prev.filter((s) => s.id !== shareId));
    } catch (err) {
      console.error('[ShareJob] Failed to remove share:', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-blue-900 dark:text-gray-100">
            {t('share.title')}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-4">
          {!isAuthenticated || !isOnline ? (
            <p className="text-gray-500 dark:text-gray-400 text-sm text-center py-4">
              {t('settings.loginToSync')}
            </p>
          ) : (
            <>
              {/* Share form */}
              <div className="space-y-3">
                <div>
                  <input
                    type="email"
                    className="input-field"
                    placeholder={t('share.emailPlaceholder')}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleShare()}
                  />
                </div>
                <div className="flex gap-2">
                  <select
                    className="input-field flex-1"
                    value={role}
                    onChange={(e) => setRole(e.target.value as 'viewer' | 'editor')}
                  >
                    <option value="viewer">{t('share.viewer')}</option>
                    <option value="editor">{t('share.editor')}</option>
                  </select>
                  <button
                    onClick={handleShare}
                    disabled={loading || !email.trim()}
                    className="btn-primary px-6 disabled:opacity-50"
                  >
                    {loading ? '...' : t('share.share')}
                  </button>
                </div>
                {error && (
                  <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                )}
              </div>

              {/* Current shares list */}
              {shares.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                    {t('share.sharedWith')}
                  </h3>
                  <div className="space-y-2">
                    {shares.map((share) => (
                      <div
                        key={share.id}
                        className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                            {share.user_name || share.user_email}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {share.role === 'viewer' ? t('share.viewer') : t('share.editor')}
                          </p>
                        </div>
                        <button
                          onClick={() => handleRemoveShare(share.id)}
                          className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 text-sm ml-2"
                        >
                          {t('share.remove')}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
