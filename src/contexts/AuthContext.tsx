import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { getAuthUser, authWithGoogle, logout as pbLogout, isOnline as checkOnline, isPBConfigured, testConnection } from '../utils/pocketbase';
import { getSettings, saveSettings } from '../utils/db';

interface AuthUser {
  id: string;
  email: string;
  name: string;
}

type SyncStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'error' | 'unconfigured';

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isOnline: boolean;
  syncStatus: SyncStatus;
  pbUrl: string | null;
  login: () => Promise<boolean>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
  setPbUrl: (url: string) => Promise<boolean>;
  setSyncStatus: (status: SyncStatus) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isOnlineState, setIsOnlineState] = useState(navigator.onLine);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('unconfigured');
  const [pbUrl, setPbUrlState] = useState<string | null>(null);

  // Initialize: check if PB is configured and user is logged in
  useEffect(() => {
    let mounted = true;
    (async () => {
      const configured = await isPBConfigured();
      if (!configured) {
        if (mounted) setSyncStatus('unconfigured');
        return;
      }

      const settings = await getSettings();
      if (mounted) setPbUrlState(settings.pocketbase_url || null);

      const authUser = await getAuthUser();
      if (mounted && authUser) {
        setUser(authUser);
        const online = await checkOnline();
        if (online) {
          setSyncStatus('syncing');
          try {
            const { fullSync, startRealtimeSync } = await import('../utils/sync');
            await fullSync();
            await startRealtimeSync();
            if (mounted) setSyncStatus('synced');
          } catch {
            if (mounted) setSyncStatus('synced');
          }
        } else {
          setSyncStatus('offline');
        }
      } else if (mounted) {
        setSyncStatus('offline');
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Listen for online/offline events
  useEffect(() => {
    const handleOnline = () => {
      setIsOnlineState(true);
      if (user) {
        checkOnline().then(online => {
          setSyncStatus(online ? 'synced' : 'error');
        });
      }
    };
    const handleOffline = () => {
      setIsOnlineState(false);
      if (syncStatus !== 'unconfigured') setSyncStatus('offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [user, syncStatus]);

  const login = useCallback(async (): Promise<boolean> => {
    try {
      const authUser = await authWithGoogle();
      if (authUser) {
        setUser(authUser);
        setSyncStatus('syncing');
        // Trigger full sync + start realtime after login
        try {
          const { fullSync, startRealtimeSync } = await import('../utils/sync');
          await fullSync();
          await startRealtimeSync();
          setSyncStatus('synced');
        } catch (err) {
          console.warn('[Auth] Post-login sync failed:', err);
          setSyncStatus('synced');
        }
        return true;
      }
      return false;
    } catch (err) {
      console.error('[Auth] Login failed:', err);
      return false;
    }
  }, []);

  const logout = useCallback(async () => {
    await pbLogout();
    setUser(null);
    setSyncStatus(pbUrl ? 'offline' : 'unconfigured');
  }, [pbUrl]);

  const refreshAuth = useCallback(async () => {
    const authUser = await getAuthUser();
    if (authUser) {
      setUser(authUser);
      setSyncStatus('synced');
    }
  }, []);

  const setPbUrl = useCallback(async (url: string): Promise<boolean> => {
    const reachable = await testConnection(url);
    if (reachable) {
      const currentSettings = await getSettings();
      await saveSettings({ ...currentSettings, pocketbase_url: url });
      setPbUrlState(url);
      setSyncStatus('offline'); // configured but not logged in yet
      return true;
    }
    return false;
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated: !!user,
      isOnline: isOnlineState,
      syncStatus,
      pbUrl,
      login,
      logout,
      refreshAuth,
      setPbUrl,
      setSyncStatus,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
