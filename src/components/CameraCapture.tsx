import { useRef, useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from '../contexts/I18nContext';

type PermissionState = 'unknown' | 'checking' | 'granted' | 'denied' | 'unavailable';

interface CameraCaptureProps {
  onCapture: (blob: Blob) => void;
  onClose: () => void;
  loading?: boolean;
}

export default function CameraCapture({ onCapture, onClose, loading }: CameraCaptureProps) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingStream = useRef<MediaStream | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<Blob | null>(null);
  const [permissionState, setPermissionState] = useState<PermissionState>('unknown');

  // Attach pending stream to video element after it renders
  useEffect(() => {
    if (isCameraActive && pendingStream.current && videoRef.current) {
      videoRef.current.srcObject = pendingStream.current;
      pendingStream.current = null;
    }
  }, [isCameraActive]);

  const startCamera = async () => {
    // Check if mediaDevices API is available (requires HTTPS or localhost)
    if (!navigator.mediaDevices?.getUserMedia) {
      setPermissionState('unavailable');
      return;
    }

    setPermissionState('checking');

    // Check permission status first if the API supports it
    try {
      if (navigator.permissions?.query) {
        const result = await navigator.permissions.query({ name: 'camera' as PermissionName });
        if (result.state === 'denied') {
          setPermissionState('denied');
          return;
        }
      }
    } catch {
      // permissions.query not supported for camera in some browsers — proceed to getUserMedia
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      pendingStream.current = stream;
      setIsCameraActive(true);
      setPermissionState('granted');
    } catch (error: any) {
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        setPermissionState('denied');
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        setPermissionState('unavailable');
      } else {
        setPermissionState('unavailable');
        toast.error(t('toast.cameraNotAvailable'));
      }
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      setSelectedFile(file);

      const reader = new FileReader();
      reader.onload = (e) => {
        setPreview(e.target?.result as string);
      };
      reader.onerror = () => {
        toast.error(t('toast.fileReadFailed'));
      };
      reader.readAsDataURL(file);
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        ctx.drawImage(videoRef.current, 0, 0);
        const imageUrl = canvasRef.current.toDataURL('image/jpeg');
        setPreview(imageUrl);
      }
    }
  };

  const saveFullResToDevice = async (dataUrl: string) => {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `ElectricalPro_${timestamp}.jpg`;

      // Convert data URL to blob for sharing
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], filename, { type: 'image/jpeg' });

      // Use Web Share API on mobile — saves directly to camera roll / photos
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
        console.log('[Camera] Full-res photo shared/saved via Share API');
        toast.success(t('toast.fullResSaved'));
      } else {
        // Fallback for desktop: trigger download
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        console.log('[Camera] Full-res photo downloaded');
        toast.success(t('toast.fullResSaved'));
      }
    } catch (err: any) {
      // User cancelled the share sheet — not an error
      if (err?.name === 'AbortError') return;
      console.warn('[Camera] Could not save full-res to device:', err);
    }
  };

  const confirmCapture = async () => {
    if (!preview) return;

    try {
      // Load the preview data URL (already in memory) into an Image to resize via canvas
      const img = new Image();
      img.src = preview;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Image load failed'));
      });

      // Save full-resolution version to device (non-blocking)
      saveFullResToDevice(preview);

      // Compress for the app — keep resolution high for AI, just reduce file size
      const maxWidth = 1920;
      let width = img.width;
      let height = img.height;
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);

      const compressed = await new Promise<Blob>((resolve) => {
        canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.75);
      });

      console.log(`[Camera] Compressed for app: ${compressed.size} bytes (${width}x${height})`);
      onCapture(compressed);
    } catch (err) {
      console.error('[Camera] Compression failed, using original:', err);
      // Fallback: use original file if compression fails
      if (selectedFile) {
        onCapture(selectedFile);
      }
    }

    if (!selectedFile) stopCamera();
    setPreview(null);
    setSelectedFile(null);
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    if (pendingStream.current) {
      pendingStream.current.getTracks().forEach((track) => track.stop());
      pendingStream.current = null;
    }
    setIsCameraActive(false);
  };

  const handleClose = () => {
    stopCamera();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white/95 dark:bg-gray-800/95 rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-blue-900 dark:text-gray-100">{t('camera.capturePanel')}</h2>
          <button onClick={handleClose} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6">
          {!isCameraActive && !preview && (
            <div className="text-center">
              {/* Permission denied state */}
              {permissionState === 'denied' && (
                <div className="mb-4 p-4 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg text-left">
                  <div className="flex items-start gap-3">
                    <svg className="w-6 h-6 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                    <div>
                      <p className="font-medium text-amber-800 dark:text-amber-200 mb-1">{t('camera.permissionDenied')}</p>
                      <p className="text-sm text-amber-700 dark:text-amber-300 mb-2">{t('camera.permissionDeniedDesc')}</p>
                      <ol className="text-sm text-amber-700 dark:text-amber-300 list-decimal list-inside space-y-1">
                        <li>{t('camera.permissionStep1')}</li>
                        <li>{t('camera.permissionStep2')}</li>
                        <li>{t('camera.permissionStep3')}</li>
                      </ol>
                    </div>
                  </div>
                </div>
              )}

              {/* No camera / not HTTPS state */}
              {permissionState === 'unavailable' && (
                <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg text-left">
                  <div className="flex items-start gap-3">
                    <svg className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                    </svg>
                    <div>
                      <p className="font-medium text-red-800 dark:text-red-200 mb-1">{t('camera.notAvailable')}</p>
                      <p className="text-sm text-red-700 dark:text-red-300">{t('camera.notAvailableDesc')}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Default / checking state */}
              {permissionState !== 'denied' && permissionState !== 'unavailable' && (
                <>
                  <svg className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">{t('camera.takeClearPhoto')}</p>
                </>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="btn-primary w-full mb-3 flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {t('camera.chooseFromLibrary')}
              </button>

              {permissionState !== 'unavailable' && (
                <button
                  onClick={startCamera}
                  disabled={permissionState === 'checking'}
                  className="btn-secondary w-full disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {permissionState === 'checking' && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  </svg>
                  {permissionState === 'denied' ? t('camera.tryAgain') : t('camera.openCamera')}
                </button>
              )}
            </div>
          )}

          {isCameraActive && !preview && (
            <div>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className="w-full rounded-lg bg-black mb-4"
              />
              <div className="flex gap-3">
                <button
                  onClick={capturePhoto}
                  className="btn-primary flex-1 flex items-center justify-center gap-2"
                >
                  {t('camera.capture')}
                </button>
                <button onClick={stopCamera} className="btn-secondary flex-1">
                  {t('camera.cancel')}
                </button>
              </div>
            </div>
          )}

          {preview && (
            <div>
              <img src={preview} alt="Captured" className="w-full rounded-lg mb-4" />
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{t('camera.lookGood')}</p>

              <div className="flex gap-3">
                <button
                  onClick={confirmCapture}
                  disabled={loading}
                  className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>}
                  {loading ? t('camera.uploading') : t('camera.upload')}
                </button>
                <button
                  onClick={() => setPreview(null)}
                  className="btn-secondary flex-1"
                >
                  {t('camera.retake')}
                </button>
              </div>
            </div>
          )}

          <canvas ref={canvasRef} className="hidden" />
        </div>
      </div>
    </div>
  );
}
