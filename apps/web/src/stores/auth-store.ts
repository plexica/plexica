// auth-store.ts
// Single Zustand store for authentication state.
// Handles login, logout, PKCE callback, token refresh, and session expiry.
// Tokens are persisted in sessionStorage (cleared on browser close).

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import {
  exchangeCode,
  getLoginUrl,
  refreshTokens,
  revokeSession,
} from '../services/keycloak-auth.js';

import type { AuthState, UserProfile } from '../types/auth.js';

interface AuthStore extends AuthState {
  tenantSlug: string | null;
  realm: string | null;

  // Actions
  login: () => Promise<void>;
  logout: () => Promise<void>;
  handleCallback: (code: string, state: string) => Promise<void>;
  refresh: () => Promise<void>;
  setSessionExpired: () => void;
  dismissExpired: () => void;
  setTenantContext: (slug: string, realm: string) => void;
}

// L-1: decode base64url (JWT uses - and _ instead of + and /) and handle
// UTF-8 encoded characters (e.g. non-ASCII names). atob() alone handles neither.
function decodeBase64Url(input: string): unknown {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

function decodeUserProfile(accessToken: string, realm: string): UserProfile {
  const parts = accessToken.split('.');
  const payload = decodeBase64Url(parts[1] ?? '') as Record<string, unknown>;
  return {
    id: String(payload['sub'] ?? ''),
    email: String(payload['email'] ?? ''),
    firstName: String(payload['given_name'] ?? ''),
    lastName: String(payload['family_name'] ?? ''),
    realm,
    roles: (payload['realm_access'] as { roles?: string[] } | undefined)?.roles ?? [],
  };
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      idToken: null,
      userProfile: null,
      status: 'unauthenticated',
      isAuthenticated: false,
      tenantSlug: null,
      realm: null,

      setTenantContext: (slug: string, realm: string) => {
        set({ tenantSlug: slug, realm });
      },

      login: async () => {
        const { realm } = get();
        if (realm === null) throw new Error('Realm not set — call setTenantContext first');
        set({ status: 'authenticating' });
        const state = crypto.randomUUID();
        sessionStorage.setItem('auth_state', state);
        const url = await getLoginUrl(realm, state);
        window.location.href = url;
      },

      logout: async () => {
        const { refreshToken, realm, tenantSlug } = get();

        // Backchannel logout: revoke the Keycloak session server-side before
        // clearing local state. No browser redirect to Keycloak is needed,
        // which avoids all redirect-URI validation issues entirely.
        if (refreshToken !== null && realm !== null) {
          await revokeSession(realm, refreshToken);
        }

        set({
          accessToken: null,
          refreshToken: null,
          idToken: null,
          userProfile: null,
          status: 'unauthenticated',
          isAuthenticated: false,
        });

        // Full page reload so the app re-initialises cleanly.
        // tenantSlug stays in sessionStorage (not cleared) so the root loader
        // fast-path resolves the tenant on the next load.
        const tenantParam = tenantSlug !== null ? `?tenant=${encodeURIComponent(tenantSlug)}` : '';
        window.location.href = `/${tenantParam}`;
      },

      handleCallback: async (code: string, state: string) => {
        const expectedState = sessionStorage.getItem('auth_state');
        if (state !== expectedState) throw new Error('State mismatch — possible CSRF');

        const { realm } = get();
        if (realm === null) throw new Error('Realm not set');

        const codeVerifier = sessionStorage.getItem('pkce_code_verifier');
        if (codeVerifier === null) throw new Error('PKCE verifier missing');

        const tokens = await exchangeCode(code, realm, codeVerifier);
        const userProfile = decodeUserProfile(tokens.access_token, realm);

        sessionStorage.removeItem('pkce_code_verifier');
        sessionStorage.removeItem('auth_state');

        set({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          idToken: tokens.id_token,
          userProfile,
          status: 'authenticated',
          isAuthenticated: true,
        });
      },

      refresh: async () => {
        const { refreshToken, realm } = get();
        if (refreshToken === null || realm === null) throw new Error('Cannot refresh');
        const tokens = await refreshTokens(refreshToken, realm);
        const userProfile = decodeUserProfile(tokens.access_token, realm);
        set({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          idToken: tokens.id_token,
          userProfile,
          status: 'authenticated',
          isAuthenticated: true,
        });
      },

      setSessionExpired: () => {
        set({ status: 'expired', isAuthenticated: false });
      },

      dismissExpired: () => {
        set({ status: 'unauthenticated' });
      },
    }),
    {
      name: 'plexica-auth',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        idToken: state.idToken,
        userProfile: state.userProfile,
        tenantSlug: state.tenantSlug,
        realm: state.realm,
      }),
      // L-03: on rehydration, derive transient fields from persisted tokens.
      // `status` and `isAuthenticated` are not persisted (they would go stale).
      // Without this, a page reload leaves the store in `status: 'unauthenticated'`
      // even when valid tokens exist, which triggers a spurious Keycloak redirect.
      //
      // M-6 fix: also verify the access token has not expired before marking the
      // session as authenticated. An expired token in sessionStorage (e.g. the
      // browser was suspended for > 60s) must not restore `status: 'authenticated'`
      // — that would allow stale tokens to bypass the refresh-on-401 guard.
      onRehydrateStorage: () => (state) => {
        if (state !== undefined && state.accessToken !== null) {
          const parts = state.accessToken.split('.');
          const payloadPart = parts[1];
          if (payloadPart !== undefined) {
            try {
              const payload = decodeBase64Url(payloadPart) as Record<string, unknown>;
              const exp = typeof payload['exp'] === 'number' ? payload['exp'] : 0;
              if (exp > Date.now() / 1000) {
                state.status = 'authenticated';
                state.isAuthenticated = true;
              }
              // If exp <= now, leave status as 'unauthenticated' — the app will
              // redirect to Keycloak for a fresh login or attempt a silent refresh.
            } catch {
              // Malformed token payload — leave as unauthenticated.
            }
          }
        }
      },
    }
  )
);
