// auth-store.ts
// Single Zustand store for the tenant web app authentication state.
// Handles PKCE login, token refresh, session expiry, and tenant context.
//
// Uses shared utilities from @plexica/auth:
//   - decodeBase64Url, extractBaseProfile, isTokenValid from @plexica/auth/jwt
//   - rehydrateStatus, partializeAuthState from @plexica/auth/auth-store

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { extractBaseProfile } from '@plexica/auth/jwt';
import { createRehydrationHandler, partializeAuthState } from '@plexica/auth/auth-store';

import { keycloakClient, REDIRECT_URI } from '../services/keycloak-auth.js';

import type { UserProfile, AuthState } from '../types/auth.js';

interface AuthStore extends AuthState {
  // Actions
  login: () => Promise<void>;
  logout: () => Promise<void>;
  handleCallback: (code: string, state: string) => Promise<void>;
  refresh: () => Promise<void>;
  setSessionExpired: () => void;
  dismissExpired: () => void;
  setTenantContext: (slug: string, realm: string, uuid?: string) => void;
}

function decodeUserProfile(accessToken: string, realm: string): UserProfile {
  const base = extractBaseProfile(accessToken);
  const roles = base.roles;
  const result: UserProfile = {
    ...base,
    realm,
  };
  if (roles.includes('tenant_admin')) {
    result.tenantRole = 'tenant_admin';
  } else if (roles.includes('member')) {
    result.tenantRole = 'member';
  }
  return result;
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
      tenantUuid: null,
      realm: null,

      setTenantContext: (slug: string, realm: string, uuid?: string) => {
        set({ tenantSlug: slug, tenantUuid: uuid ?? null, realm });
      },

      login: async () => {
        const { realm } = get();
        if (realm === null) throw new Error('Realm not set — call setTenantContext first');
        set({ status: 'authenticating' });
        const state = crypto.randomUUID();
        sessionStorage.setItem('auth_state', state);
        const url = await keycloakClient.getLoginUrl(realm, state, REDIRECT_URI);
        window.location.href = url;
      },

      logout: async () => {
        const { refreshToken, realm, tenantSlug } = get();

        if (refreshToken !== null && realm !== null) {
          await keycloakClient.revokeSession(refreshToken, realm);
        }

        set({
          accessToken: null,
          refreshToken: null,
          idToken: null,
          userProfile: null,
          status: 'unauthenticated',
          isAuthenticated: false,
        });

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

        const tokens = await keycloakClient.exchangeCode(code, realm, codeVerifier, REDIRECT_URI);
        const userProfile = decodeUserProfile(tokens.access_token, realm);

        sessionStorage.removeItem('pkce_code_verifier');
        sessionStorage.removeItem('auth_state');

        set({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          idToken: tokens.id_token ?? null,
          userProfile,
          status: 'authenticated',
          isAuthenticated: true,
        });
      },

      refresh: async () => {
        const { refreshToken, realm } = get();
        if (refreshToken === null || realm === null) throw new Error('Cannot refresh');
        const tokens = await keycloakClient.refreshTokens(refreshToken, realm);
        const userProfile = decodeUserProfile(tokens.access_token, realm);
        set({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          idToken: tokens.id_token ?? null,
          userProfile,
          status: 'authenticated',
          isAuthenticated: true,
        });
      },

      setSessionExpired: () => {
        // Clear tokens so rehydration on next page load detects
        // accessToken === null and preserves the 'expired' status
        // (via rehydrateStatus). Without this, a page reload after
        // session expiry would silently re-authenticate the user because
        // the store still holds a (possibly invalid) refresh token.
        set({
          accessToken: null,
          refreshToken: null,
          idToken: null,
          userProfile: null,
          status: 'expired',
          isAuthenticated: false,
        });
      },

      dismissExpired: () => {
        set({ status: 'unauthenticated' });
      },
    }),
    {
      name: 'plexica-auth',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        ...partializeAuthState(state),
        idToken: state.idToken,
        tenantSlug: state.tenantSlug,
        tenantUuid: state.tenantUuid,
        realm: state.realm,
      }),
      // Derive transient fields from persisted tokens on rehydration.
      onRehydrateStorage: createRehydrationHandler(),
    },
  ),
);
