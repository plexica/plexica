// apps/web/src/contexts/IntlContext.tsx
import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import { IntlProvider as ReactIntlProvider } from 'react-intl';
import { resolveLocale, isValidLocale } from '@plexica/i18n';

interface IntlContextValue {
  locale: string;
  setLocale: (locale: string) => void;
  messages: Record<string, string>;
  setMessages: (
    messages: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)
  ) => void;
  mergeMessages: (messages: Record<string, string>) => void;
}

const IntlContext = createContext<IntlContextValue | undefined>(undefined);

interface IntlProviderProps {
  children: ReactNode;
}

/**
 * IntlProvider: Manages locale state and provides react-intl context
 *
 * Features:
 * - Resolves initial locale via @plexica/i18n resolveLocale() utility
 * - Persists locale selection to localStorage
 * - Provides locale and messages to child components
 * - Wraps app with react-intl IntlProvider
 */
export function IntlProvider({ children }: IntlProviderProps) {
  // Resolve initial locale from fallback chain:
  // 1. localStorage (user preference)
  // 2. Browser language
  // 3. Default 'en'
  const getInitialLocale = (): string => {
    try {
      const storedLocale = localStorage?.getItem('plexica_locale');
      const browserLocale = navigator?.language;

      return resolveLocale({
        userLocale: storedLocale || undefined,
        browserLocale,
        tenantDefaultLocale: undefined, // Will be set after user authentication
      });
    } catch {
      // Fallback for SSR, tests, or environments without localStorage/navigator
      return 'en';
    }
  };

  const [locale, setLocaleState] = useState<string>(getInitialLocale);
  const [messages, setMessages] = useState<Record<string, string>>({});

  // Persist locale changes to localStorage (memoized to prevent infinite loops)
  const setLocale = useCallback((newLocale: string) => {
    // Validate locale format before updating
    if (!isValidLocale(newLocale)) {
      if (import.meta.env.DEV) {
        console.warn(`[IntlContext] Invalid locale: "${newLocale}". Ignoring setLocale call.`);
      }
      return; // Don't update to invalid locale
    }

    // Clear messages FIRST (synchronous) to prevent flicker
    setMessages({});

    // THEN update locale
    setLocaleState(newLocale);

    // Persist to localStorage
    try {
      localStorage?.setItem('plexica_locale', newLocale);
    } catch {
      // Ignore storage errors in SSR/test environments
    }
  }, []);

  // Helper function to merge new messages with existing ones (memoized)
  const mergeMessages = useCallback((newMessages: Record<string, string>) => {
    setMessages((prev) => ({
      ...prev,
      ...newMessages,
    }));
  }, []);

  // Memoize context value to prevent unnecessary re-renders
  const contextValue: IntlContextValue = useMemo(
    () => ({
      locale,
      setLocale,
      messages,
      setMessages,
      mergeMessages,
    }),
    [locale, setLocale, messages, mergeMessages]
  );

  return (
    <IntlContext.Provider value={contextValue}>
      <ReactIntlProvider
        locale={locale}
        messages={messages}
        defaultLocale="en"
        onError={(err) => {
          // Suppress missing translation warnings in development
          if (err.code === 'MISSING_TRANSLATION') {
            if (import.meta.env.DEV) {
              console.warn('Missing translation:', err.message);
            }
            return;
          }
          if (import.meta.env.DEV) {
            console.error('react-intl error:', err);
          }
        }}
      >
        {children}
      </ReactIntlProvider>
    </IntlContext.Provider>
  );
}

/**
 * useIntl: Hook to access locale state and translation messages
 */
export function useIntl() {
  const context = useContext(IntlContext);
  if (context === undefined) {
    throw new Error('useIntl must be used within an IntlProvider');
  }
  return context;
}
