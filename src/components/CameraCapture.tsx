import { useRef, useState } from 'react';
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
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [cameraFailed, setCameraFailed] = useState(false);
  const [selectedFile, setSelectedFile] = useState<Blob | null>(null);
  const [permissionState, setPermissionState] = useState<PermissionState>('unknown');

  const startCamera = async () => {
    // Check if mediaDevices API is available (requires HTTPS or localhost)
    if (!navigator.mediaDevices?.getUserMedia) {
      setPermissionState('unavailable');
      setCameraFailed(true);
      return;
    }

    setPermissionState('checking');

    // Check permission status first if the API supports it
    try {
      if (navigator.permissions?.query) {
        const result = await navigator.permissions.query({ name: 'camera' as PermissionName });
        if (result.state === 'denied') {
          setPermissionState('denied');
          setCameraFailed(true);
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
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsCameraActive(true);
        setCameraFailed(false);
        setPermissionState('granted');
      }
    } catch (error: any) {
      setCameraFailed(true);
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

  const confirmCapture = () => {
    if (selectedFile) {
      onCapture(selectedFile);
      setPreview(null);
      setSelectedFile(null);
    } else if (canvasRef.current) {
      canvasRef.current.toBlob((blob) => {
        if (blob) {
          onCapture(blob);
          stopCamera();
          setPreview(null);
        }
      }, 'image/jpeg', 0.9);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      setIsCameraActive(false);
    }
  };

  const handleClose = () => {
    stopCamera();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
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

              {permissionState !== 'unavailable' && (
                <button
                  onClick={startCamera}
                  disabled={permissionState === 'checking'}
                  className="btn-primary w-full mb-3 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {permissionState === 'checking' && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {permissionState === 'denied' ? t('camera.tryAgain') : t('camera.openCamera')}
                </button>
              )}

              {/* File upload fallback — always shown when camera fails */}
              {cameraFailed && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-500 dark:text-gray-400">{t('camera.or')}</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="btn-secondary w-full"
                  >
                    {t('camera.chooseFromLibrary')}
                  </button>
                </div>
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
