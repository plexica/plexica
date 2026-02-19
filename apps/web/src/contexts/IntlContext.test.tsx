// apps/web/src/contexts/IntlContext.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { IntlProvider, useIntl } from './IntlContext';
import type { ReactNode } from 'react';

// Mock @plexica/i18n
vi.mock('@plexica/i18n', () => ({
  resolveLocale: vi.fn(({ userLocale, browserLocale }) => {
    return userLocale || browserLocale || 'en';
  }),
  isValidLocale: vi.fn((locale: string) => {
    // Simple validation: locale should match pattern like "en", "en-US", "it-IT"
    return /^[a-z]{2}(-[A-Z]{2})?$/.test(locale);
  }),
}));

describe('IntlContext', () => {
  beforeEach(() => {
    // Clear mocks before each test
    vi.clearAllMocks();
    localStorage.clear();
    // Reset navigator.language
    Object.defineProperty(globalThis.navigator, 'language', {
      value: 'en-US',
      writable: true,
      configurable: true,
    });
  });

  describe('IntlProvider initialization', () => {
    it('should resolve initial locale from localStorage', () => {
      localStorage.getItem = vi.fn().mockReturnValue('es');

      const { result } = renderHook(() => useIntl(), {
        wrapper: ({ children }: { children: ReactNode }) => <IntlProvider>{children}</IntlProvider>,
      });

      expect(result.current.locale).toBe('es');
    });

    it('should resolve initial locale from browser when localStorage empty', () => {
      localStorage.getItem = vi.fn().mockReturnValue(null);
      Object.defineProperty(globalThis.navigator, 'language', {
        value: 'it-IT',
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useIntl(), {
        wrapper: ({ children }: { children: ReactNode }) => <IntlProvider>{children}</IntlProvider>,
      });

      expect(result.current.locale).toBe('it-IT');
    });

    it('should fallback to "en" when localStorage and navigator fail', () => {
      localStorage.getItem = vi.fn().mockImplementation(() => {
        throw new Error('localStorage not available');
      });

      const { result } = renderHook(() => useIntl(), {
        wrapper: ({ children }: { children: ReactNode }) => <IntlProvider>{children}</IntlProvider>,
      });

      expect(result.current.locale).toBe('en');
    });

    it('should initialize with empty messages', () => {
      const { result } = renderHook(() => useIntl(), {
        wrapper: ({ children }: { children: ReactNode }) => <IntlProvider>{children}</IntlProvider>,
      });

      expect(result.current.messages).toEqual({});
    });
  });

  describe('setLocale', () => {
    it('should update locale state', () => {
      const { result } = renderHook(() => useIntl(), {
        wrapper: ({ children }: { children: ReactNode }) => <IntlProvider>{children}</IntlProvider>,
      });

      act(() => {
        result.current.setLocale('fr');
      });

      expect(result.current.locale).toBe('fr');
    });

    it('should reject invalid locale format', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const { result } = renderHook(() => useIntl(), {
        wrapper: ({ children }: { children: ReactNode }) => <IntlProvider>{children}</IntlProvider>,
      });

      const initialLocale = result.current.locale;

      act(() => {
        result.current.setLocale('invalid_locale_123'); // Invalid format
      });

      // Locale should NOT change for invalid input
      expect(result.current.locale).toBe(initialLocale);

      consoleWarnSpy.mockRestore();
    });

    it('should persist locale to localStorage', () => {
      const { result } = renderHook(() => useIntl(), {
        wrapper: ({ children }: { children: ReactNode }) => <IntlProvider>{children}</IntlProvider>,
      });

      act(() => {
        result.current.setLocale('de');
      });

      expect(localStorage.setItem).toHaveBeenCalledWith('plexica_locale', 'de');
    });

    it('should handle localStorage errors gracefully', () => {
      localStorage.setItem = vi.fn().mockImplementation(() => {
        throw new Error('Storage quota exceeded');
      });

      const { result } = renderHook(() => useIntl(), {
        wrapper: ({ children }: { children: ReactNode }) => <IntlProvider>{children}</IntlProvider>,
      });

      // Should not throw
      expect(() => {
        act(() => {
          result.current.setLocale('es');
        });
      }).not.toThrow();

      // Locale should still be updated
      expect(result.current.locale).toBe('es');
    });

    it('should clear messages when locale changes', async () => {
      const { result } = renderHook(() => useIntl(), {
        wrapper: ({ children }: { children: ReactNode }) => <IntlProvider>{children}</IntlProvider>,
      });

      // Add some messages
      act(() => {
        result.current.mergeMessages({ key1: 'value1', key2: 'value2' });
      });

      expect(result.current.messages).toEqual({ key1: 'value1', key2: 'value2' });

      // Change locale
      act(() => {
        result.current.setLocale('it');
      });

      // Messages should be cleared
      await waitFor(() => {
        expect(result.current.messages).toEqual({});
      });
    });
  });

  describe('mergeMessages', () => {
    it('should merge new messages with existing ones', () => {
      const { result } = renderHook(() => useIntl(), {
        wrapper: ({ children }: { children: ReactNode }) => <IntlProvider>{children}</IntlProvider>,
      });

      act(() => {
        result.current.mergeMessages({ greeting: 'Hello' });
      });

      expect(result.current.messages).toEqual({ greeting: 'Hello' });

      act(() => {
        result.current.mergeMessages({ farewell: 'Goodbye' });
      });

      expect(result.current.messages).toEqual({
        greeting: 'Hello',
        farewell: 'Goodbye',
      });
    });

    it('should override existing keys', () => {
      const { result } = renderHook(() => useIntl(), {
        wrapper: ({ children }: { children: ReactNode }) => <IntlProvider>{children}</IntlProvider>,
      });

      act(() => {
        result.current.mergeMessages({ greeting: 'Hello' });
      });

      act(() => {
        result.current.mergeMessages({ greeting: 'Hola' });
      });

      expect(result.current.messages).toEqual({ greeting: 'Hola' });
    });

    it('should be memoized to prevent infinite loops', () => {
      const { result } = renderHook(() => useIntl(), {
        wrapper: ({ children }: { children: ReactNode }) => <IntlProvider>{children}</IntlProvider>,
      });

      const firstMergeMessages = result.current.mergeMessages;

      act(() => {
        result.current.mergeMessages({ key: 'value' });
      });

      const secondMergeMessages = result.current.mergeMessages;

      // Function reference should remain stable
      expect(firstMergeMessages).toBe(secondMergeMessages);
    });
  });

  describe('setMessages', () => {
    it('should replace all messages', () => {
      const { result } = renderHook(() => useIntl(), {
        wrapper: ({ children }: { children: ReactNode }) => <IntlProvider>{children}</IntlProvider>,
      });

      act(() => {
        result.current.mergeMessages({ key1: 'value1' });
      });

      act(() => {
        result.current.setMessages({ key2: 'value2' });
      });

      expect(result.current.messages).toEqual({ key2: 'value2' });
    });

    it('should accept a function updater', () => {
      const { result } = renderHook(() => useIntl(), {
        wrapper: ({ children }: { children: ReactNode }) => <IntlProvider>{children}</IntlProvider>,
      });

      act(() => {
        result.current.setMessages({ count: '1' });
      });

      act(() => {
        result.current.setMessages((prev) => ({ ...prev, count: '2' }));
      });

      expect(result.current.messages).toEqual({ count: '2' });
    });
  });

  describe('context value stability', () => {
    it('should not cause re-renders when messages have not changed', () => {
      let renderCount = 0;

      const { result } = renderHook(
        () => {
          renderCount++;
          return useIntl();
        },
        {
          wrapper: ({ children }: { children: ReactNode }) => (
            <IntlProvider>{children}</IntlProvider>
          ),
        }
      );

      const initialRenderCount = renderCount;

      // Trigger a state update that doesn't change messages
      act(() => {
        result.current.mergeMessages({});
      });

      // Should only re-render once for the state update
      expect(renderCount).toBe(initialRenderCount + 1);
    });
  });

  describe('error handling', () => {
    it('should throw error when useIntl is used outside IntlProvider', () => {
      expect(() => {
        renderHook(() => useIntl());
      }).toThrow('useIntl must be used within an IntlProvider');
    });
  });
});
