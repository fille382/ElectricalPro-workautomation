import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useTranslation } from '../contexts/I18nContext';
import { useTheme } from '../contexts/ThemeContext';

interface SettingsPageProps {
  apiKey: string | null;
  onApiKeyChange: (key: string) => void;
}

export default function SettingsPage({ apiKey, onApiKeyChange }: SettingsPageProps) {
  const [tempApiKey, setTempApiKey] = useState(apiKey || '');
  const [showApiKey, setShowApiKey] = useState(false);
  const navigate = useNavigate();
  const { t, language, languageSetting, setLanguage } = useTranslation();
  const { themeSetting, setTheme } = useTheme();

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
