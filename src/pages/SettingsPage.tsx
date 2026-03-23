import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useTranslation } from '../contexts/I18nContext';
import { useTheme } from '../contexts/ThemeContext';
import { useDebugLog } from '../contexts/DebugLogContext';
import { useAuth } from '../contexts/AuthContext';
import { getSettings, saveSettings } from '../utils/db';

interface SettingsPageProps {
  apiKey: string | null;
  onApiKeyChange: (key: string) => void;
}

export default function SettingsPage({ apiKey, onApiKeyChange }: SettingsPageProps) {
  const [tempApiKey, setTempApiKey] = useState(apiKey || '');
  const [showApiKey, setShowApiKey] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [companyWebsite, setCompanyWebsite] = useState('');
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { t, language, languageSetting, setLanguage } = useTranslation();
  const { themeSetting, setTheme } = useTheme();
  const { enabled: debugEnabled, setEnabled: setDebugEnabled } = useDebugLog();
  const { user, isAuthenticated, syncStatus, pbUrl, login, logout: authLogout, setPbUrl, setSyncStatus } = useAuth();
  const [tempPbUrl, setTempPbUrl] = useState(pbUrl || '');
  const [connectingPb, setConnectingPb] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);

  // Load company settings on mount
  useEffect(() => {
    getSettings().then((s) => {
      setCompanyName(s.company_name || '');
      setCompanyWebsite(s.company_website || '');
      setCompanyLogo(s.company_logo || null);
      if (s.pocketbase_url) setTempPbUrl(s.pocketbase_url);
    });
  }, []);

  const saveCompanySettings = async (updates: { company_name?: string; company_website?: string; company_logo?: string }) => {
    const current = await getSettings();
    await saveSettings({ ...current, ...updates });
  };


  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      const dataUrl = reader.result as string;
      setCompanyLogo(dataUrl);
      await saveCompanySettings({ company_logo: dataUrl });
      toast.success(t('settings.companyLogo') + ' ✓');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSaveApiKey = () => {
    if (!tempApiKey.trim()) {
      toast.error(t('toast.apiKeyEmpty'));
      return;
    }
    onApiKeyChange(tempApiKey);
  };

  const handleClearStorage = () => {
    if (confirm(t('settings.confirmClear'))) {
      indexedDB.deleteDatabase('electrician_app');
      localStorage.clear();
      toast.success(t('toast.dataClearedRefreshing'));
      setTimeout(() => window.location.reload(), 1000);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-3xl font-bold text-blue-900 dark:text-gray-100 mb-6">{t('settings.title')}</h1>

      {/* Preferences Section */}
      <div className="card mb-6">
        <h2 className="text-xl font-bold text-blue-900 dark:text-gray-100 mb-4">{t('settings.preferences')}</h2>
        <div className="space-y-4">
          <div>
            <label className="label-text">{t('settings.language')}</label>
            <select
              className="input-field"
              value={languageSetting}
              onChange={(e) => setLanguage(e.target.value as 'auto' | 'en' | 'sv')}
            >
              <option value="auto">{t('settings.languageAuto')} ({language === 'sv' ? 'Svenska' : 'English'})</option>
              <option value="en">English</option>
              <option value="sv">Svenska</option>
            </select>
          </div>
          <div>
            <label className="label-text">{t('settings.theme')}</label>
            <select
              className="input-field"
              value={themeSetting}
              onChange={(e) => setTheme(e.target.value as 'system' | 'light' | 'dark')}
            >
              <option value="system">{t('settings.themeSystem')}</option>
              <option value="light">{t('settings.themeLight')}</option>
              <option value="dark">{t('settings.themeDark')}</option>
            </select>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <label className="label-text mb-0">{t('settings.debugLog')}</label>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('settings.debugLogDesc')}</p>
            </div>
            <button
              onClick={() => setDebugEnabled(!debugEnabled)}
              className={`relative w-12 h-6 rounded-full transition-colors ${debugEnabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${debugEnabled ? 'translate-x-6' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Company Profile Section */}
      <div className="card mb-6">
        <h2 className="text-xl font-bold text-blue-900 dark:text-gray-100 mb-4">{t('settings.company')}</h2>
        <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            {/* Logo preview */}
            <div
              className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center cursor-pointer hover:border-blue-400 transition-colors overflow-hidden flex-shrink-0"
              onClick={() => logoInputRef.current?.click()}
            >
              {companyLogo ? (
                <img src={companyLogo} alt="Logo" className="w-full h-full object-contain" />
              ) : (
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              )}
            </div>
            <div className="flex-1 space-y-2">
              <button onClick={() => logoInputRef.current?.click()} className="text-sm text-blue-500 hover:text-blue-600">
                {t('settings.uploadLogo')}
              </button>
              {companyLogo && (
                <button
                  onClick={async () => { setCompanyLogo(null); await saveCompanySettings({ company_logo: '' }); }}
                  className="text-sm text-red-500 hover:text-red-600 ml-3"
                >
                  {t('settings.removeLogo')}
                </button>
              )}
            </div>
          </div>
          <div>
            <label className="label-text">{t('settings.companyName')}</label>
            <input
              className="input-field"
              placeholder="T.ex. Bellanders El AB"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              onBlur={() => saveCompanySettings({ company_name: companyName })}
            />
          </div>
          <div>
            <label className="label-text">{t('settings.companyWebsite')}</label>
            <input
              className="input-field"
              placeholder="www.example.se"
              value={companyWebsite}
              onChange={(e) => setCompanyWebsite(e.target.value)}
              onBlur={() => saveCompanySettings({ company_website: companyWebsite })}
            />
          </div>
        </div>
      </div>

      {/* Sync & Account Section */}
      <div className="card mb-6">
        <h2 className="text-xl font-bold text-blue-900 dark:text-gray-100 mb-4">{t('settings.sync')}</h2>
        <div className="space-y-4">
          {/* PocketBase URL */}
          <div>
            <label className="label-text">{t('settings.pbUrl')}</label>
            <div className="flex gap-2">
              <input
                className="input-field flex-1"
                placeholder="https://your-server.pockethost.io"
                value={tempPbUrl}
                onChange={(e) => setTempPbUrl(e.target.value)}
              />
              <button
                onClick={async () => {
                  if (!tempPbUrl.trim()) return;
                  setConnectingPb(true);
                  const ok = await setPbUrl(tempPbUrl.trim());
                  setConnectingPb(false);
                  if (ok) {
                    toast.success(t('login.connected'));
                  } else {
                    toast.error(t('login.connectionFailed'));
                  }
                }}
                disabled={connectingPb || !tempPbUrl.trim()}
                className="btn-primary px-4 disabled:opacity-50"
              >
                {connectingPb ? '...' : pbUrl ? t('login.connected') : t('login.connect')}
              </button>
            </div>
          </div>

          {/* Status */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400">{t('settings.syncStatus')}</span>
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {syncStatus === 'synced' && t('sync.synced')}
              {syncStatus === 'syncing' && t('sync.syncing')}
              {syncStatus === 'offline' && t('sync.offline')}
              {syncStatus === 'error' && t('sync.error')}
              {syncStatus === 'unconfigured' && t('sync.unconfigured')}
              {syncStatus === 'idle' && t('sync.synced')}
            </span>
          </div>

          {/* Auth state */}
          {pbUrl && isAuthenticated && user ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-green-800 dark:text-green-200">
                    {t('settings.loggedInAs')}
                  </p>
                  <p className="text-sm text-green-700 dark:text-green-300">{user.name} ({user.email})</p>
                </div>
                <button
                  onClick={async () => {
                    await authLogout();
                    toast.success(t('settings.logout'));
                  }}
                  className="text-sm text-red-600 dark:text-red-400 hover:underline"
                >
                  {t('settings.logout')}
                </button>
              </div>
              <button
                onClick={() => {
                  setSyncStatus('syncing');
                  // Trigger a sync - for now just set back to synced after a delay
                  setTimeout(() => setSyncStatus('synced'), 1500);
                  toast.success(t('settings.syncNow'));
                }}
                className="btn-primary w-full"
              >
                {t('settings.syncNow')}
              </button>
            </div>
          ) : pbUrl ? (
            <button
              onClick={async () => {
                setLoggingIn(true);
                const ok = await login();
                setLoggingIn(false);
                if (!ok) {
                  toast.error(t('login.loginFailed'));
                }
              }}
              disabled={loggingIn}
              className="btn-primary w-full disabled:opacity-50"
            >
              {loggingIn ? t('login.signingIn') : t('settings.loginToSync')}
            </button>
          ) : null}
        </div>
      </div>

      {/* API Key Section */}
      <div className="card mb-6">
        <h2 className="text-xl font-bold text-blue-900 dark:text-gray-100 mb-4">{t('settings.claudeApiConfig')}</h2>
        <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">{t('settings.claudeApiDescription')}</p>

        <div className="mb-4">
          <label className="label-text">{t('settings.claudeApiKey')}</label>
          <div className="flex gap-2">
            <input
              type={showApiKey ? 'text' : 'password'}
              className="input-field flex-1"
              placeholder="sk-ant-..."
              value={tempApiKey}
              onChange={(e) => setTempApiKey(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              {showApiKey ? (
                <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>
        </div>

        <div className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          <p className="mb-2">
            {t('settings.getApiKey')}{' '}
            <a href="https://console.anthropic.com/account/keys" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">
              {t('settings.anthropicConsole')}
            </a>
          </p>
          <p className="text-yellow-700 dark:text-yellow-300 bg-yellow-50 dark:bg-yellow-900/20 p-2 rounded">
            {t('settings.apiKeyWarning')}
          </p>
        </div>

        {apiKey ? (
          <div className="mb-4 flex items-center gap-2 text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/20 p-2 rounded">
            <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            {t('settings.apiKeyConfigured')}
          </div>
        ) : (
          <div className="mb-4 flex items-center gap-2 text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 p-2 rounded">
            <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            {t('settings.apiKeyNotConfigured')}
          </div>
        )}

        <button onClick={handleSaveApiKey} className="btn-primary w-full">{t('settings.saveApiKey')}</button>
      </div>

      {/* App Info Section */}
      <div className="card mb-6">
        <h2 className="text-xl font-bold text-blue-900 dark:text-gray-100 mb-4">{t('settings.appInfo')}</h2>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">{t('settings.appVersion')}</span>
            <span className="font-medium text-blue-900 dark:text-gray-100">1.0.0</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">{t('settings.storageType')}</span>
            <span className="font-medium text-blue-900 dark:text-gray-100">{t('settings.storageValue')}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">{t('settings.targetRegion')}</span>
            <span className="font-medium text-blue-900 dark:text-gray-100">{t('settings.targetRegionValue')}</span>
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="card border-2 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
        <h2 className="text-xl font-bold text-red-900 dark:text-red-300 mb-4">{t('settings.dangerZone')}</h2>
        <p className="text-red-700 dark:text-red-400 text-sm mb-4">{t('settings.clearStorageWarning')}</p>
        <button onClick={handleClearStorage} className="btn-danger w-full">{t('settings.clearAllData')}</button>
      </div>

      <div className="mt-6">
        <button onClick={() => navigate('/')} className="btn-secondary w-full">{t('settings.backToJobs')}</button>
      </div>
    </div>
  );
}
