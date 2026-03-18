import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from '../contexts/I18nContext';
import { useClaude } from '../hooks/useClaude';
import { blobToDataURL } from '../utils/claude';
import type { Photo } from '../types';

interface PhotoDetailProps {
  photo: Photo;
  cachedPhotoURL?: string | null;
  onClose: () => void;
  apiKey?: string | null;
  onAnalyze?: (photoId: string, analysis: any) => Promise<any>;
  onDelete?: (photoId: string) => Promise<void>;
  jobContext?: { name: string; description?: string; address?: string };
}

export default function PhotoDetail({ photo, cachedPhotoURL, onClose, apiKey, onAnalyze, onDelete, jobContext }: PhotoDetailProps) {
  const { t, language } = useTranslation();
  const info = photo.extracted_info;
  const { analyzePanel, loading: analyzing } = useClaude(apiKey || null);
  const [photoURL, setPhotoURL] = useState<string | null>(cachedPhotoURL || null);

  useEffect(() => {
    if (cachedPhotoURL) {
      setPhotoURL(cachedPhotoURL);
      return;
    }

    if (!photo.image_data) {
      setPhotoURL(null);
      return;
    }

    let mounted = true;
    blobToDataURL(photo.image_data)
      .then((url) => { if (mounted) setPhotoURL(url); })
      .catch(() => { if (mounted) setPhotoURL(null); });
    return () => { mounted = false; };
  }, [photo.id, cachedPhotoURL]);

  const handleAnalyzeNow = async () => {
    if (!apiKey) {
      toast.error(t('toast.addApiKeyInSettings'));
      return;
    }

    try {
      const analysis = await analyzePanel(photo.image_data, language, jobContext);
      if (onAnalyze) {
        await onAnalyze(photo.id, analysis);
      }
      toast.success(t('toast.analyzedSuccess'));
    } catch (error) {
      console.error('Full PhotoDetail error:', error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      toast.error(t('toast.analysisFailed', { msg: errorMsg }));
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 md:p-0" onClick={onClose}>
      <div className="bg-white/95 dark:bg-gray-800/95 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-blue-900 dark:text-gray-100">{t('photoDetail.title')}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Photo */}
          <div>
            {photoURL ? (
              <img
                src={photoURL}
                alt="Electrical work photo"
                className="w-full rounded-lg"
                onError={(e) => {
                  (e.target as HTMLImageElement).alt = 'Unable to load image';
                }}
              />
            ) : (
              <div className="w-full h-48 bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center">
                <p className="text-gray-500 dark:text-gray-400">{t('photoDetail.loadingImage')}</p>
              </div>
            )}
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
              {t('photoDetail.captured')} {new Date(photo.created_at).toLocaleString()}
            </p>
          </div>

          {/* Extracted Information */}
          {info ? (
            <div className="bg-blue-50 dark:bg-gray-700/50 rounded-lg p-4 space-y-4">
              <h3 className="font-bold text-blue-900 dark:text-gray-100">{t('photoDetail.panelInfo')}</h3>

              {info.component_type && (
                <div className="grid grid-cols-2 gap-2">
                  <span className="text-gray-600 dark:text-gray-400">{t('photoDetail.componentType')}</span>
                  <span className="font-medium dark:text-gray-200 capitalize">{info.component_type}</span>
                </div>
              )}

              {info.location_notes && (
                <div className="grid grid-cols-2 gap-2">
                  <span className="text-gray-600 dark:text-gray-400">{t('photoDetail.locationNotes')}</span>
                  <span className="font-medium dark:text-gray-200">{info.location_notes}</span>
                </div>
              )}

              {info.manufacturer && (
                <div className="grid grid-cols-2 gap-2">
                  <span className="text-gray-600 dark:text-gray-400">{t('photoDetail.manufacturer')}</span>
                  <span className="font-medium dark:text-gray-200">{info.manufacturer}</span>
                </div>
              )}

              {info.model && (
                <div className="grid grid-cols-2 gap-2">
                  <span className="text-gray-600 dark:text-gray-400">{t('photoDetail.model')}</span>
                  <span className="font-medium dark:text-gray-200">{info.model}</span>
                </div>
              )}

              {info.voltage && (
                <div className="grid grid-cols-2 gap-2">
                  <span className="text-gray-600 dark:text-gray-400">{t('photoDetail.voltage')}</span>
                  <span className="font-medium dark:text-gray-200">{info.voltage}</span>
                </div>
              )}

              {info.amperage && (
                <div className="grid grid-cols-2 gap-2">
                  <span className="text-gray-600 dark:text-gray-400">{t('photoDetail.amperage')}</span>
                  <span className="font-medium dark:text-gray-200">{info.amperage}</span>
                </div>
              )}

              {info.circuits && (
                <div className="grid grid-cols-2 gap-2">
                  <span className="text-gray-600 dark:text-gray-400">{t('photoDetail.circuits')}</span>
                  <span className="font-medium dark:text-gray-200">{info.circuits}</span>
                </div>
              )}

              {info.condition && (
                <div className="grid grid-cols-2 gap-2">
                  <span className="text-gray-600 dark:text-gray-400">{t('photoDetail.condition')}</span>
                  <span className="font-medium dark:text-gray-200 capitalize">{info.condition}</span>
                </div>
              )}

              {info.compliance_marks && info.compliance_marks.length > 0 && (
                <div>
                  <span className="text-gray-600 dark:text-gray-400 block mb-1">{t('photoDetail.compliance')}</span>
                  <div className="flex flex-wrap gap-2">
                    {info.compliance_marks.map((mark, idx) => (
                      <span key={idx} className="badge badge-success">
                        {mark}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {info.recommendations && info.recommendations.length > 0 && (
                <div>
                  <span className="text-gray-600 dark:text-gray-400 block mb-2">{t('photoDetail.recommendations')}</span>
                  <ul className="space-y-1 text-sm">
                    {info.recommendations.map((rec, idx) => (
                      <li key={idx} className="flex gap-2">
                        <span className="text-blue-600 dark:text-blue-400">•</span>
                        <span className="dark:text-gray-300">{rec}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {info.raw_analysis && (
                <div className="border-t border-blue-200 dark:border-gray-600 pt-4">
                  <span className="text-gray-600 dark:text-gray-400 block mb-2 text-sm">{t('photoDetail.detailedAnalysis')}</span>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{info.raw_analysis}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <p className="text-yellow-900 dark:text-yellow-200 text-sm mb-3">
                {t('photoDetail.notAnalyzed')} {apiKey ? t('photoDetail.clickAnalyze') : t('photoDetail.addApiKey')}
              </p>
              {apiKey ? (
                <button
                  onClick={handleAnalyzeNow}
                  disabled={analyzing}
                  className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {analyzing && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>}
                  {analyzing ? t('photoDetail.analyzing') : t('photoDetail.analyzeNow')}
                </button>
              ) : (
                <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-2">{t('photoDetail.apiKeyNotDetected')}</p>
              )}
            </div>
          )}

          {/* Notes */}
          {photo.user_notes && (
            <div>
              <h3 className="font-bold text-blue-900 dark:text-gray-100 mb-2">{t('photoDetail.notes')}</h3>
              <p className="text-gray-700 dark:text-gray-300">{photo.user_notes}</p>
            </div>
          )}

          <div className="flex gap-3">
            {onDelete && (
              <button
                onClick={() => onDelete(photo.id)}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                {t('photoDetail.remove')}
              </button>
            )}
            <button onClick={onClose} className="btn-secondary flex-1">
              {t('photoDetail.close')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
