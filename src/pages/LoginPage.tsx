import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../contexts/I18nContext';
import { isEnvConfigured } from '../utils/pocketbase';

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { login, setPbUrl, pbUrl, isAuthenticated } = useAuth();
  const envConfigured = isEnvConfigured();
  const [url, setUrl] = useState(pbUrl || '');
  const [testing, setTesting] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [connected, setConnected] = useState(!!pbUrl || envConfigured);
  const [error, setError] = useState('');

  // Already logged in — redirect
  if (isAuthenticated) {
    navigate('/');
    return null;
  }

  const handleConnect = async () => {
    setTesting(true);
    setError('');
    let cleanUrl = url.trim();
    if (cleanUrl && !cleanUrl.startsWith('http')) {
      cleanUrl = 'https://' + cleanUrl;
      setUrl(cleanUrl);
    }
    const success = await setPbUrl(cleanUrl);
    if (success) {
      setConnected(true);
    } else {
      setError(t('login.connectionFailed'));
    }
    setTesting(false);
  };

  const handleGoogleLogin = async () => {
    setLoggingIn(true);
    setError('');
    const success = await login();
    if (success) {
      navigate('/');
    } else {
      setError(t('login.loginFailed'));
    }
    setLoggingIn(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50 dark:bg-gray-900">
      <div className="card max-w-md w-full p-8">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">ElectricalPro</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">{t('login.subtitle')}</p>
        </div>

        {/* Server URL — only show if NOT configured via env var */}
        {!envConfigured && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('login.serverUrl')}
            </label>
            <div className="flex gap-2">
              <input
                type="url"
                value={url}
                onChange={(e) => { setUrl(e.target.value); setConnected(false); setError(''); }}
                placeholder="https://your-server.trycloudflare.com"
                className="input flex-1"
                disabled={connected}
              />
              <button
                onClick={connected ? () => { setConnected(false); setUrl(''); } : handleConnect}
                disabled={testing || (!connected && !url.trim())}
                className={`px-4 py-2 rounded-lg font-medium text-sm whitespace-nowrap ${
                  connected
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {testing ? '...' : connected ? '✓ ' + t('login.connected') : t('login.connect')}
              </button>
            </div>
          </div>
        )}

        {/* Google Login — show immediately if env configured, otherwise after connect */}
        {connected && (
          <button
            onClick={handleGoogleLogin}
            disabled={loggingIn}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            <span className="font-medium text-gray-700 dark:text-gray-200">
              {loggingIn ? t('login.signingIn') : t('login.signInWithGoogle')}
            </span>
          </button>
        )}

        {error && (
          <p className="mt-4 text-sm text-red-600 dark:text-red-400 text-center">{error}</p>
        )}

        {/* Continue offline */}
        <div className="mt-6 text-center">
          <button
            onClick={() => navigate('/')}
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 underline"
          >
            {t('login.continueOffline')}
          </button>
        </div>
      </div>
    </div>
  );
}
