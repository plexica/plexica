// apps/web/src/stores/auth.store.ts
//
// OAuth 2.0 Authorization Code auth store (Spec 002 Phase 7a).
// Replaces the old keycloak-js-based auth-store.ts.
//
// Responsibilities:
//  1. Token storage in memory only (access) + sessionStorage (refresh)
//  2. Silent token refresh 60 s before access token expires (FR-014)
//  3. Session expiry detection: emit 'plexica:session-expired' event on failure
//  4. Deep-link preservation: save current URL to sessionStorage before login redirect
//  5. Logout: POST /auth/logout, clear state, redirect to login
//  6. Auth callback: parse token response, extract user from JWT claims (FR-003)

import { create } from 'zustand';
import { jwtDecode } from 'jwt-decode';
import type { TenantUser as User } from '@plexica/types';
import { getTenantFromUrl } from '@/lib/tenant';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthUser extends Omit<User, 'tenantId' | 'permissions'> {
  tenantId?: string;
  permissions?: string[];
  /** Display name (first + last or username) */
  displayName: string;
  /** Avatar URL from Keycloak profile (may be absent) */
  avatarUrl?: string;
}

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  /** Absolute UTC ms timestamp when access token expires */
  expiresAt: number;
}

export interface AuthStoreState {
  /** In-memory access token — NEVER written to localStorage */
  tokenSet: TokenSet | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  /** True during initial page load / OAuth callback exchange */
  isLoading: boolean;
  /** True while silent refresh is in-flight */
  isRefreshing: boolean;
  /** Last auth error (displayed on login page) */
  error: string | null;
  /**
   * T005-17: True when the most recent silent token refresh has failed.
   * Consumed by AuthWarningBanner (ENABLE_AUTH_WARNING_BANNER flag).
   * Reset to false whenever setTokens() succeeds.
   */
  refreshFailed: boolean;
}

export interface AuthStoreActions {
  /** Called by callback route after backend returns tokens */
  setTokens: (tokenSet: TokenSet) => void;
  /** Trigger silent token refresh (called automatically near expiry) */
  refreshTokens: () => Promise<boolean>;
  /** Clear all auth state and emit session-expired event */
  expireSession: () => void;
  /** Full logout: revoke tokens on backend, clear state, redirect */
  logout: () => Promise<void>;
  /** Save current URL for post-login deep-link restore */
  saveDeepLink: (url?: string) => void;
  /** Consume saved deep-link URL (clears after reading) */
  consumeDeepLink: () => string | null;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearAuth: () => void;
  /**
   * T005-17: Manually set refreshFailed (used by AuthWarningBanner dismiss).
   * refreshFailed is also reset automatically by setTokens() on success.
   */
  setRefreshFailed: (failed: boolean) => void;
}

export type AuthStore = AuthStoreState & AuthStoreActions;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEEP_LINK_KEY = 'plexica-deep-link';
const REFRESH_TOKEN_KEY = 'plexica-refresh-token';
/** Refresh 60 s before actual expiry */
const REFRESH_BUFFER_MS = 60_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractUserFromToken(accessToken: string): AuthUser | null {
  try {
    const payload = jwtDecode<Record<string, unknown>>(accessToken);
    const sub = payload.sub as string | undefined;
    const email = (payload.email as string | undefined) ?? '';
    const name = (payload.name as string | undefined) ?? '';
    const givenName = (payload.given_name as string | undefined) ?? '';
    const familyName = (payload.family_name as string | undefined) ?? '';
    const preferredUsername = (payload.preferred_username as string | undefined) ?? '';
    const realmRoles =
      ((payload.realm_access as { roles?: string[] } | undefined)?.roles as string[]) ?? [];
    const picture = (payload.picture as string | undefined) ?? undefined;
    const tenantId = (payload.tenant_id as string | undefined) ?? undefined;

    const displayName =
      [givenName, familyName].filter(Boolean).join(' ') || preferredUsername || email || 'User';

    return {
      id: sub ?? '',
      email,
      name: name || displayName,
      displayName,
      roles: realmRoles,
      tenantId,
      permissions: [],
      avatarUrl: picture,
    };
  } catch {
    return null;
  }
}

function saveRefreshToken(token: string): void {
  try {
    sessionStorage.setItem(REFRESH_TOKEN_KEY, token);
  } catch {
    // sessionStorage unavailable — continue in-memory only
  }
}

function loadRefreshToken(): string | null {
  try {
    return sessionStorage.getItem(REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
}

function clearRefreshToken(): void {
  try {
    sessionStorage.removeItem(REFRESH_TOKEN_KEY);
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Silent refresh timer
// ---------------------------------------------------------------------------

let refreshTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleRefresh(expiresAt: number, refresh: () => void): void {
  if (refreshTimer) clearTimeout(refreshTimer);
  const delay = Math.max(0, expiresAt - Date.now() - REFRESH_BUFFER_MS);
  refreshTimer = setTimeout(refresh, delay);
}

function cancelRefresh(): void {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useAuthStore = create<AuthStore>()((set, get) => ({
  // --- State ---
  tokenSet: null,
  user: null,
  isAuthenticated: false,
  isLoading: true,
  isRefreshing: false,
  error: null,
  refreshFailed: false,

  // --- Actions ---

  setTokens: (tokenSet) => {
    const user = extractUserFromToken(tokenSet.accessToken);
    saveRefreshToken(tokenSet.refreshToken);
    set({
      tokenSet,
      user,
      isAuthenticated: true,
      isLoading: false,
      error: null,
      refreshFailed: false,
    });

    // Schedule silent refresh
    scheduleRefresh(tokenSet.expiresAt, () => {
      get()
        .refreshTokens()
        .catch(() => {
          get().expireSession();
        });
    });
  },

  refreshTokens: async () => {
    const { tokenSet } = get();
    const refreshToken = tokenSet?.refreshToken ?? loadRefreshToken();
    if (!refreshToken) {
      get().expireSession();
      return false;
    }

    set({ isRefreshing: true });
    try {
      const tenantSlug = getTenantFromUrl();
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      const res = await fetch(`${apiUrl}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantSlug, refreshToken }),
      });

      if (!res.ok) {
        set({ refreshFailed: true });
        get().expireSession();
        return false;
      }

      const data = (await res.json()) as {
        access_token: string;
        refresh_token: string;
        expires_in: number;
      };

      const newTokenSet: TokenSet = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: Date.now() + data.expires_in * 1000,
      };

      get().setTokens(newTokenSet);
      return true;
    } catch {
      set({ refreshFailed: true });
      get().expireSession();
      return false;
    } finally {
      set({ isRefreshing: false });
    }
  },

  expireSession: () => {
    cancelRefresh();
    clearRefreshToken();
    set({
      tokenSet: null,
      user: null,
      isAuthenticated: false,
      isRefreshing: false,
    });
    window.dispatchEvent(new CustomEvent('plexica:session-expired'));
  },

  logout: async () => {
    const { tokenSet } = get();
    const tenantSlug = getTenantFromUrl();
    cancelRefresh();

    if (tokenSet?.refreshToken) {
      try {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
        await fetch(`${apiUrl}/api/v1/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tokenSet.accessToken}`,
          },
          body: JSON.stringify({ tenantSlug, refreshToken: tokenSet.refreshToken }),
        });
      } catch {
        // Best-effort — proceed with local logout even if backend fails
      }
    }

    clearRefreshToken();
    set({
      tokenSet: null,
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });

    // Redirect to tenant login page
    window.location.href = '/login';
  },

  saveDeepLink: (url) => {
    const target = url ?? window.location.pathname + window.location.search;
    if (target && target !== '/login' && !target.startsWith('/auth/')) {
      try {
        sessionStorage.setItem(DEEP_LINK_KEY, target);
      } catch {
        // ignore
      }
    }
  },

  consumeDeepLink: () => {
    try {
      const url = sessionStorage.getItem(DEEP_LINK_KEY);
      if (url) sessionStorage.removeItem(DEEP_LINK_KEY);
      return url;
    } catch {
      return null;
    }
  },

  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
  setRefreshFailed: (failed) => set({ refreshFailed: failed }),

  clearAuth: () => {
    cancelRefresh();
    clearRefreshToken();
    set({
      tokenSet: null,
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
  },
}));

// ---------------------------------------------------------------------------
// Bootstrap: attempt to resume session from sessionStorage refresh token
// ---------------------------------------------------------------------------

export async function bootstrapAuth(): Promise<void> {
  const store = useAuthStore.getState();
  const savedRefresh = loadRefreshToken();

  if (!savedRefresh) {
    store.setLoading(false);
    return;
  }

  // Attempt silent refresh with saved token
  await store.refreshTokens();
}

// Re-export token getter for use by auth-client.ts
export function getAccessToken(): string | null {
  return useAuthStore.getState().tokenSet?.accessToken ?? null;
}
