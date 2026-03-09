import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

type ThemeSetting = 'light' | 'dark' | 'system';
type ResolvedTheme = 'light' | 'dark';

interface ThemeContextValue {
  theme: ResolvedTheme;
  themeSetting: ThemeSetting;
  setTheme: (t: ThemeSetting) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

interface ThemeProviderProps {
  children: ReactNode;
  initialTheme?: ThemeSetting;
  onThemeChange?: (t: ThemeSetting) => void;
}

export function ThemeProvider({ children, initialTheme = 'system', onThemeChange }: ThemeProviderProps) {
  const [themeSetting, setThemeSettingState] = useState<ThemeSetting>(initialTheme);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(getSystemTheme);

  // Listen for system theme changes
  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemTheme(e.matches ? 'dark' : 'light');
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  const resolvedTheme: ResolvedTheme = themeSetting === 'system' ? systemTheme : themeSetting;

  // Apply .dark class to <html>
  useEffect(() => {
    const html = document.documentElement;
    if (resolvedTheme === 'dark') {
      html.classList.add('dark');
    } else {
      html.classList.remove('dark');
    }
  }, [resolvedTheme]);

  const setTheme = useCallback((t: ThemeSetting) => {
    setThemeSettingState(t);
    onThemeChange?.(t);
  }, [onThemeChange]);

  return (
    <ThemeContext.Provider value={{ theme: resolvedTheme, themeSetting, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
