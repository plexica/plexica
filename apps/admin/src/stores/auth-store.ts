// auth-store.ts
// Single Zustand store for the admin app authentication state.
// Uses PKCE Authorization Code Flow against the Keycloak master realm.
// Falls back to direct password grant for E2E tests (kept for transition).
//
// Uses shared utilities from @plexica/auth:
//   - extractBaseProfile, isTokenValid from @plexica/auth/jwt
//   - rehydrateStatus, partializeAuthState from @plexica/auth/auth-store

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import { extractBaseProfile, isTokenValid } from '@plexica/auth/jwt';
import { rehydrateStatus, partializeAuthState } from '@plexica/auth/auth-store';

import { keycloakClient, REDIRECT_URI } from '../services/keycloak-auth.js';

import type { AdminUserProfile, AuthState } from '../types/auth.js';

interface AuthStore extends AuthState {
  // Actions
  login: () => Promise<void>;
  logout: () => Promise<void>;
  handleCallback: (code: string, state: string) => Promise<void>;
  refresh: () => Promise<void>;
  setSessionExpired: () => void;
  dismissExpired: () => void;
}

function decodeAdminProfile(accessToken: string): AdminUserProfile {
  const base = extractBaseProfile(accessToken);
  return {
    ...base,
    realm: 'master' as const,
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

      login: async () => {
        set({ status: 'authenticating' });
        const state = crypto.randomUUID();
        sessionStorage.setItem('auth_state', state);
        const url = await keycloakClient.getLoginUrl('master', state, REDIRECT_URI);
        window.location.href = url;
      },

      logout: async () => {
        const { refreshToken } = get();
        if (refreshToken !== null) {
          await keycloakClient.revokeSession(refreshToken);
        }
        set({
          accessToken: null,
          refreshToken: null,
          idToken: null,
          userProfile: null,
          status: 'unauthenticated',
          isAuthenticated: false,
        });
        // Reload to reset router state and clear any cached queries.
        window.location.href = '/';
      },

      handleCallback: async (code: string, state: string) => {
        const expectedState = sessionStorage.getItem('auth_state');
        if (state !== expectedState) throw new Error('State mismatch — possible CSRF');

        const codeVerifier = sessionStorage.getItem('pkce_code_verifier');
        if (codeVerifier === null) throw new Error('PKCE verifier missing');

        const tokens = await keycloakClient.exchangeCode(code, 'master', codeVerifier, REDIRECT_URI);
        const userProfile = decodeAdminProfile(tokens.access_token);

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
        const { refreshToken } = get();
        if (refreshToken === null) throw new Error('Cannot refresh — no refresh token');
        const tokens = await keycloakClient.refreshTokens(refreshToken);
        const userProfile = decodeAdminProfile(tokens.access_token);
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
        set({ status: 'expired', isAuthenticated: false });
      },

      dismissExpired: () => {
        set({ status: 'unauthenticated' });
      },
    }),
    {
      name: 'plexica-admin-auth',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => partializeAuthState({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        userProfile: state.userProfile,
      }),
      onRehydrateStorage: () => (state) => {
        if (state !== undefined) {
          state.status = rehydrateStatus(state.accessToken);
          state.isAuthenticated = isTokenValid(state.accessToken ?? '');
        }
      },
    },
  ),
);
