import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import en from '../i18n/en';
import sv from '../i18n/sv';
import type { TranslationKey } from '../i18n/en';

type Language = 'en' | 'sv';

interface I18nContextValue {
  language: Language;
  setLanguage: (lang: Language | 'auto') => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  languageSetting: Language | 'auto';
}

const translations = { en, sv } as const;

function detectLanguage(): Language {
  const nav = navigator.language || '';
  return nav.startsWith('sv') ? 'sv' : 'en';
}

const I18nContext = createContext<I18nContextValue | null>(null);

interface I18nProviderProps {
  children: ReactNode;
  initialLanguage?: Language | 'auto';
  onLanguageChange?: (lang: Language | 'auto') => void;
}

export function I18nProvider({ children, initialLanguage = 'auto', onLanguageChange }: I18nProviderProps) {
  const [languageSetting, setLanguageSetting] = useState<Language | 'auto'>(initialLanguage);

  const resolvedLanguage: Language = languageSetting === 'auto' ? detectLanguage() : languageSetting;

  const setLanguage = useCallback((lang: Language | 'auto') => {
    setLanguageSetting(lang);
    onLanguageChange?.(lang);
  }, [onLanguageChange]);

  const t = useCallback((key: TranslationKey, params?: Record<string, string | number>): string => {
    let text: string = translations[resolvedLanguage][key] || translations.en[key] || key;
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        text = text.replace(`{${k}}`, String(v));
      });
    }
    return text;
  }, [resolvedLanguage]);

  return (
    <I18nContext.Provider value={{ language: resolvedLanguage, setLanguage, t, languageSetting }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useTranslation() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useTranslation must be used within I18nProvider');
  return ctx;
}
