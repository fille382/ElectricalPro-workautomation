import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

interface LogEntry {
  id: number;
  level: 'log' | 'warn' | 'error';
  message: string;
  time: string;
}

interface DebugLogContextValue {
  logs: LogEntry[];
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  clear: () => void;
}

const DebugLogContext = createContext<DebugLogContextValue | null>(null);

let nextId = 0;

export function DebugLogProvider({ children }: { children: ReactNode }) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [enabled, setEnabledState] = useState(() => localStorage.getItem('debug_log') === 'true');

  const setEnabled = useCallback((v: boolean) => {
    setEnabledState(v);
    localStorage.setItem('debug_log', v ? 'true' : 'false');
  }, []);

  const clear = useCallback(() => setLogs([]), []);

  useEffect(() => {
    if (!enabled) return;

    const origLog = console.log;
    const origWarn = console.warn;
    const origError = console.error;

    const addEntry = (level: LogEntry['level'], args: any[]) => {
      const message = args.map((a) => {
        if (typeof a === 'string') return a;
        try { return JSON.stringify(a, null, 0); } catch { return String(a); }
      }).join(' ');

      // Truncate long messages
      const truncated = message.length > 500 ? message.slice(0, 500) + '...' : message;

      setLogs((prev) => {
        const entry: LogEntry = {
          id: nextId++,
          level,
          message: truncated,
          time: new Date().toLocaleTimeString(),
        };
        // Keep last 100 entries
        const next = [...prev, entry];
        return next.length > 100 ? next.slice(-100) : next;
      });
    };

    console.log = (...args: any[]) => { origLog.apply(console, args); addEntry('log', args); };
    console.warn = (...args: any[]) => { origWarn.apply(console, args); addEntry('warn', args); };
    console.error = (...args: any[]) => { origError.apply(console, args); addEntry('error', args); };

    // Capture unhandled errors
    const onError = (e: ErrorEvent) => addEntry('error', [`Uncaught: ${e.message} at ${e.filename}:${e.lineno}`]);
    const onRejection = (e: PromiseRejectionEvent) => addEntry('error', [`Unhandled rejection: ${e.reason}`]);
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);

    return () => {
      console.log = origLog;
      console.warn = origWarn;
      console.error = origError;
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, [enabled]);

  return (
    <DebugLogContext.Provider value={{ logs, enabled, setEnabled, clear }}>
      {children}
    </DebugLogContext.Provider>
  );
}

export function useDebugLog() {
  const ctx = useContext(DebugLogContext);
  if (!ctx) throw new Error('useDebugLog must be used within DebugLogProvider');
  return ctx;
}
