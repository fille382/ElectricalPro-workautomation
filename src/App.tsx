import { useEffect, useState } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster, toast } from 'react-hot-toast';
import * as db from './utils/db';
import { seedKnowledgeBase } from './utils/knowledgeBase';
import { I18nProvider } from './contexts/I18nContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { DebugLogProvider } from './contexts/DebugLogContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { isEnvConfigured } from './utils/pocketbase';
import HomePage from './pages/HomePage';
import JobDetailPage from './pages/JobDetailPage';
import SettingsPage from './pages/SettingsPage';
import LoginPage from './pages/LoginPage';
import Header from './components/Header';
import DebugPanel from './components/DebugPanel';
import './App.css';

function RequireAuth({ children }: { children: React.ReactElement }) {
  const { isAuthenticated } = useAuth();
  // Only require auth if PocketBase is configured (env var set)
  if (isEnvConfigured() && !isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function App() {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [initialLanguage, setInitialLanguage] = useState<'en' | 'sv' | 'auto'>('auto');
  const [initialTheme, setInitialTheme] = useState<'light' | 'dark' | 'system'>('system');
  const [loading, setLoading] = useState(true);

  // Initialize database and load settings
  useEffect(() => {
    const initializeApp = async () => {
      try {
        await db.initDB();
        const settings = await db.getSettings();
        if (settings.claude_api_key) {
          setApiKey(settings.claude_api_key);
        }
        setInitialLanguage(settings.language || 'auto');
        setInitialTheme(settings.theme || 'system');
        // Seed knowledge base (no-op if already seeded)
        seedKnowledgeBase().catch((err) => console.warn('[KB] Seed failed:', err));
      } catch (error) {
        console.error('Failed to initialize app:', error);
        toast.error('Failed to initialize database');
      } finally {
        setLoading(false);
      }
    };

    initializeApp();
  }, []);

  const handleApiKeyChange = async (newKey: string) => {
    setApiKey(newKey);
    try {
      const settings = await db.getSettings();
      await db.saveSettings({
        ...settings,
        claude_api_key: newKey,
        last_updated: Date.now(),
      });
      toast.success('API key saved successfully');
    } catch {
      toast.error('Failed to save API key');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-blue-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-blue-600 font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <AuthProvider>
    <DebugLogProvider>
      <I18nProvider
        initialLanguage={initialLanguage}
        onLanguageChange={async (lang) => {
          const settings = await db.getSettings();
          await db.saveSettings({ ...settings, language: lang === 'auto' ? undefined : lang });
        }}
      >
        <ThemeProvider
          initialTheme={initialTheme}
          onThemeChange={async (theme) => {
            const settings = await db.getSettings();
            await db.saveSettings({ ...settings, theme: theme === 'system' ? undefined : theme });
          }}
        >
          <Router>
            <div className="min-h-screen bg-blue-50 dark:bg-gray-900 transition-colors">
              <Header apiKey={apiKey} />
              <main className="pb-20 md:pb-0">
                <Routes>
                  <Route path="/" element={<RequireAuth><HomePage apiKey={apiKey} /></RequireAuth>} />
                  <Route path="/job/:jobId" element={<RequireAuth><JobDetailPage apiKey={apiKey} /></RequireAuth>} />
                  <Route path="/settings" element={<RequireAuth><SettingsPage apiKey={apiKey} onApiKeyChange={handleApiKeyChange} /></RequireAuth>} />
                  <Route path="/login" element={<LoginPage />} />
                </Routes>
              </main>
              <Toaster position="bottom-center" />
              <DebugPanel />
            </div>
          </Router>
        </ThemeProvider>
      </I18nProvider>
    </DebugLogProvider>
    </AuthProvider>
  );
}

export default App;
