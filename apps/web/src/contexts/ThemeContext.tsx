// apps/web/src/contexts/ThemeContext.tsx
//
// Dual-purpose theme context:
//
//  1. Dark / Light / System mode (original behaviour — unchanged)
//  2. Tenant brand theme — colors, fonts, logo fetched from
//     GET /api/v1/tenant/settings and applied as CSS custom properties
//     on document.documentElement (Spec 010 Phase 2).
//
// The two concerns are completely orthogonal.  Dark-mode toggling and tenant
// theming do NOT conflict: dark mode sets .dark class on <html>; tenant
// theming sets --tenant-* CSS custom properties on :root.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { logger } from '@/lib/logger.js';
import {
  applyTheme,
  DEFAULT_TENANT_THEME,
  generateDarkTheme,
  validateTheme,
  type TenantTheme,
} from '@/lib/theme-utils.js';
import { loadFonts } from '@/lib/font-loader.js';
import { useAuthStore } from '@/stores/auth.store.js';
import apiClient from '@/lib/api-client.js';
import { useFeatureFlag } from '@/lib/feature-flags.js';

// ---------------------------------------------------------------------------
// Dark / Light / System (original)
// ---------------------------------------------------------------------------

type ColorScheme = 'light' | 'dark' | 'system';

interface ColorSchemeContextType {
  theme: ColorScheme;
  setTheme: (theme: ColorScheme) => void;
  isDark: boolean;
}

// ---------------------------------------------------------------------------
// Tenant theming (new — Spec 010 Phase 2)
// ---------------------------------------------------------------------------

export interface TenantThemeContextType {
  tenantTheme: TenantTheme;
  tenantThemeLoading: boolean;
  tenantThemeError: Error | null;
  refreshTenantTheme: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Combined context type
// ---------------------------------------------------------------------------

type ThemeContextType = ColorSchemeContextType & TenantThemeContextType;

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// ---------------------------------------------------------------------------
// API response shape from GET /api/v1/tenant/settings
// ---------------------------------------------------------------------------

interface TenantSettingsResponse {
  tenantId?: string;
  settings?: {
    theme?: Partial<TenantTheme>;
  };
}

// ---------------------------------------------------------------------------
// ThemeProvider
// ---------------------------------------------------------------------------

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // ------------------------------------------------------------------
  // 1. Color-scheme state (light / dark / system)
  // ------------------------------------------------------------------

  const [theme, setThemeState] = useState<ColorScheme>(() => {
    const stored = localStorage.getItem('theme') as ColorScheme | null;
    return stored ?? 'system';
  });

  // Track system preference changes to force re-computation of isDark
  const [, forceUpdate] = useState(0);

  const isDark = useMemo(() => {
    if (theme === 'dark') return true;
    if (theme === 'light') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }, [theme]);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => forceUpdate((n) => n + 1);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  const setTheme = useCallback((newTheme: ColorScheme) => {
    setThemeState(newTheme);
    localStorage.setItem('theme', newTheme);
  }, []);

  // ------------------------------------------------------------------
  // 2. Tenant theme state
  // ------------------------------------------------------------------

  const [tenantTheme, setTenantTheme] = useState<TenantTheme>(() => {
    // Apply defaults immediately to prevent FOUC
    const defaults = {
      ...DEFAULT_TENANT_THEME,
      colors: { ...DEFAULT_TENANT_THEME.colors },
      fonts: { ...DEFAULT_TENANT_THEME.fonts },
    };
    return defaults;
  });
  const [tenantThemeLoading, setTenantThemeLoading] = useState(false);
  const [tenantThemeError, setTenantThemeError] = useState<Error | null>(null);

  // Subscribe to auth store to get the current tenant slug
  const tenantId = useAuthStore((s) => s.user?.tenantId ?? null);

  // Track the last slug we fetched to avoid redundant requests
  const lastFetchedSlugRef = useRef<string | null>(null);

  const fetchTenantTheme = useCallback(async (slug: string) => {
    setTenantThemeLoading(true);
    setTenantThemeError(null);

    try {
      const response = await apiClient.get<TenantSettingsResponse>('/api/v1/tenant/settings');
      const rawTheme = response?.settings?.theme ?? null;
      const validated = validateTheme(rawTheme);
      setTenantTheme(validated);
      applyTheme(validated);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.warn(
        { tenantSlug: slug, err: error },
        'Failed to fetch tenant theme — using defaults'
      );
      setTenantThemeError(error);
      // Apply defaults so the app remains usable
      applyTheme(tenantTheme);
    } finally {
      setTenantThemeLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch when tenant slug becomes available or changes
  useEffect(() => {
    if (!tenantId) {
      // Not logged in — apply defaults and do not fetch
      applyTheme(DEFAULT_TENANT_THEME);
      return;
    }

    if (tenantId === lastFetchedSlugRef.current) return;
    lastFetchedSlugRef.current = tenantId;

    void fetchTenantTheme(tenantId);
  }, [tenantId, fetchTenantTheme]);

  // Apply default theme on first render before any fetch completes
  useEffect(() => {
    applyTheme(DEFAULT_TENANT_THEME);
    // Only on mount — empty deps is intentional
  }, []);

  // Load fonts whenever tenantTheme.fonts changes (T005-16)
  useEffect(() => {
    const { heading, body } = tenantTheme.fonts;
    void loadFonts({ heading, body });
  }, [tenantTheme.fonts]);

  // T005-20: Re-apply tenant color tokens when dark mode toggles.
  // When ENABLE_DARK_MODE is on and the current scheme is dark, derive dark
  // variants and re-apply.  On light mode restore the original tenant colors.
  const darkModeEnabled = useFeatureFlag('ENABLE_DARK_MODE');
  useEffect(() => {
    if (darkModeEnabled && isDark) {
      applyTheme(generateDarkTheme(tenantTheme));
    } else {
      applyTheme(tenantTheme);
    }
  }, [isDark, darkModeEnabled, tenantTheme]);

  const refreshTenantTheme = useCallback(async () => {
    if (!tenantId) return;
    lastFetchedSlugRef.current = null; // Force re-fetch
    await fetchTenantTheme(tenantId);
  }, [tenantId, fetchTenantTheme]);

  // ------------------------------------------------------------------
  // 3. Context value (stable — memoised)
  // ------------------------------------------------------------------

  const value = useMemo<ThemeContextType>(
    () => ({
      // color-scheme
      theme,
      setTheme,
      isDark,
      // tenant theming
      tenantTheme,
      tenantThemeLoading,
      tenantThemeError,
      refreshTenantTheme,
    }),
    [theme, setTheme, isDark, tenantTheme, tenantThemeLoading, tenantThemeError, refreshTenantTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Access the combined theme context (color-scheme + tenant theme).
 * Must be used inside ThemeProvider.
 */
export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (ctx === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
}

/**
 * Convenience hook that returns only the tenant brand theme.
 */
export function useTenantTheme(): TenantThemeContextType {
  const { tenantTheme, tenantThemeLoading, tenantThemeError, refreshTenantTheme } = useTheme();
  return { tenantTheme, tenantThemeLoading, tenantThemeError, refreshTenantTheme };
}
