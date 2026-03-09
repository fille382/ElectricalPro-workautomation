import { Link } from 'react-router-dom';
import { useTranslation } from '../contexts/I18nContext';
import { useTheme } from '../contexts/ThemeContext';

interface HeaderProps {
  apiKey: string | null;
}

export default function Header({ apiKey }: HeaderProps) {
  const { t } = useTranslation();
  const { theme, themeSetting, setTheme } = useTheme();

  const cycleTheme = () => {
    const next = themeSetting === 'system' ? 'light' : themeSetting === 'light' ? 'dark' : 'system';
    setTheme(next);
  };

  return (
    <header className="sticky top-0 z-50 bg-blue-600 dark:bg-gray-800 text-white shadow-lg md:relative md:bg-white md:dark:bg-gray-800 md:text-blue-900 md:dark:text-gray-100 md:border-b md:border-gray-200 md:dark:border-gray-700">
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <div className="w-10 h-10 bg-blue-700 md:bg-blue-600 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold">{t('header.title')}</h1>
          </Link>

          <nav className="flex items-center gap-2 md:gap-4">
            <Link to="/" className="text-sm md:text-base hover:opacity-80 transition-opacity">
              {t('header.jobs')}
            </Link>
            <Link
              to="/settings"
              className="flex items-center gap-1 text-sm md:text-base hover:opacity-80 transition-opacity"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {t('header.settings')}
            </Link>

            {/* Dark mode toggle */}
            <button
              onClick={cycleTheme}
              className="p-2 rounded-lg hover:bg-blue-700 dark:hover:bg-gray-700 md:hover:bg-gray-100 md:dark:hover:bg-gray-700 transition-colors"
              title={`${t('settings.theme')}: ${t(themeSetting === 'system' ? 'settings.themeSystem' : themeSetting === 'light' ? 'settings.themeLight' : 'settings.themeDark')}`}
            >
              {theme === 'dark' ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>

            {!apiKey && (
              <div className="hidden md:inline-block text-xs bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 px-2 py-1 rounded">
                {t('header.apiKeyRequired')}
              </div>
            )}
          </nav>
        </div>
      </div>
    </header>
  );
}
