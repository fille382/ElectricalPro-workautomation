import { useState, useEffect } from 'react';
import { useTranslation } from '../contexts/I18nContext';
import type { Photo } from '../types';
import PhotoDetail from './PhotoDetail';
import { blobToDataURL } from '../utils/claude';

interface PhotoGalleryProps {
  photos: Photo[];
  apiKey?: string | null;
  onAnalyze?: (photoId: string, analysis: any) => Promise<any>;
  onDelete?: (photoId: string) => Promise<void>;
  analyzingPhotoIds?: Set<string>;
  jobContext?: { name: string; description?: string; address?: string };
  onShowTasks?: (photoId: string) => void;
  photoTaskCounts?: Record<string, number>;
}

function PhotoThumbnail({ photo, onClick, onTextClick, isAnalyzing, onDelete, taskCount }: { photo: Photo; onClick: (dataUrl: string | null) => void; onTextClick?: () => void; isAnalyzing: boolean; onDelete?: (photoId: string) => void; taskCount?: number }) {
  const { t } = useTranslation();
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    if (photo.image_data instanceof Blob && photo.image_data.size > 0) {
      blobToDataURL(photo.image_data)
        .then((url) => { if (mounted) setImageUrl(url); })
        .catch(() => { if (mounted) setImageUrl(photo.image_url || null); });
    } else if (photo.image_url) {
      setImageUrl(photo.image_url);
    }
    return () => { mounted = false; };
  }, [photo.id]);

  const hasTaskLink = onTextClick && taskCount && taskCount > 0;

  return (
    <div className="card hover:shadow-md transition-shadow">
      <div className="flex gap-3">
        <div
          className="w-20 h-20 flex-shrink-0 bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden relative cursor-pointer"
          onClick={() => onClick(imageUrl)}
        >
          {imageUrl ? (
            <img src={imageUrl} alt="Panel" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gray-300 dark:bg-gray-600">
              <span className="text-xs text-gray-500 dark:text-gray-400">...</span>
            </div>
          )}
          {isAnalyzing && (
            <div className="absolute inset-0 bg-black bg-opacity-40 flex items-center justify-center rounded-lg">
              <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
        <div
          className={`flex-1 min-w-0 ${hasTaskLink ? 'cursor-pointer' : ''}`}
          onClick={hasTaskLink ? onTextClick : () => onClick(imageUrl)}
        >
          <p className="text-sm text-gray-600 dark:text-gray-400">{new Date(photo.created_at).toLocaleDateString()}</p>
          {isAnalyzing ? (
            <p className="text-sm text-blue-600 dark:text-blue-400 font-medium flex items-center gap-2">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              {t('photo.analyzing')}
            </p>
          ) : (
            <>
              {photo.extracted_info?.component_type && (
                <p className="font-medium text-blue-900 dark:text-gray-100 truncate capitalize">{photo.extracted_info.component_type}</p>
              )}
              {photo.extracted_info?.condition && (
                <p className="text-sm text-gray-600 dark:text-gray-400 capitalize">{photo.extracted_info.condition}</p>
              )}
              {photo.extracted_info && !photo.extracted_info.component_type && photo.extracted_info.manufacturer && (
                <p className="font-medium text-blue-900 dark:text-gray-100 truncate">{photo.extracted_info.manufacturer}</p>
              )}
              {!photo.extracted_info && <p className="text-sm text-gray-500 dark:text-gray-400 italic">{t('photo.noAnalysis')}</p>}
              {hasTaskLink && (
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-1 flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  {taskCount} {t('job.tasks').toLowerCase()}
                </p>
              )}
            </>
          )}
        </div>
        {onDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(photo.id); }}
            className="text-red-500 hover:text-red-700 transition-colors flex-shrink-0 p-1"
            title={t('photo.removePhoto')}
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

export default function PhotoGallery({ photos, apiKey, onAnalyze, onDelete, analyzingPhotoIds = new Set(), jobContext, onShowTasks, photoTaskCounts }: PhotoGalleryProps) {
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [selectedPhotoURL, setSelectedPhotoURL] = useState<string | null>(null);

  const handlePhotoClick = (photo: Photo, dataUrl: string | null) => {
    setSelectedPhoto(photo);
    setSelectedPhotoURL(dataUrl);
  };

  return (
    <>
      <div className="space-y-3">
        {photos.map((photo) => (
          <PhotoThumbnail
            key={photo.id}
            photo={photo}
            onClick={(dataUrl) => handlePhotoClick(photo, dataUrl)}
            onTextClick={onShowTasks ? () => onShowTasks(photo.id) : undefined}
            isAnalyzing={analyzingPhotoIds.has(photo.id)}
            onDelete={onDelete}
            taskCount={photoTaskCounts?.[photo.id]}
          />
        ))}
      </div>

      {selectedPhoto && (
        <PhotoDetail
          photo={selectedPhoto}
          cachedPhotoURL={selectedPhotoURL}
          onClose={() => { setSelectedPhoto(null); setSelectedPhotoURL(null); }}
          apiKey={apiKey}
          onAnalyze={onAnalyze}
          onDelete={onDelete ? async (photoId) => { await onDelete(photoId); setSelectedPhoto(null); setSelectedPhotoURL(null); } : undefined}
          jobContext={jobContext}
        />
      )}
    </>
  );
}
