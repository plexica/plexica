// auth-store.ts
// Single Zustand store for authentication state.
// Handles login, logout, PKCE callback, token refresh, and session expiry.
// Tokens are persisted in sessionStorage (cleared on browser close).

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import type { AuthState, UserProfile } from '../types/auth.js';
import {
  exchangeCode,
  getLoginUrl,
  getLogoutUrl,
  refreshTokens,
} from '../services/keycloak-auth.js';

interface AuthStore extends AuthState {
  tenantSlug: string | null;
  realm: string | null;

  // Actions
  login: () => Promise<void>;
  logout: () => void;
  handleCallback: (code: string, state: string) => Promise<void>;
  refresh: () => Promise<void>;
  setSessionExpired: () => void;
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

      logout: () => {
        const { idToken, realm } = get();
        set({
          accessToken: null,
          refreshToken: null,
          idToken: null,
          userProfile: null,
          status: 'unauthenticated',
          isAuthenticated: false,
        });
        if (realm !== null && idToken !== null) {
          window.location.href = getLogoutUrl(realm, idToken);
        }
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
    }
  )
);
