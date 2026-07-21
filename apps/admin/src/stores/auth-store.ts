// auth-store.ts
// Single Zustand store for the admin app authentication state.
// Uses direct password grant against the Keycloak master realm (internal tool).
// After PKCE migration, this will use PKCE redirect instead.
//
// Uses shared utilities from @plexica/auth:
//   - decodeBase64Url, extractBaseProfile, isTokenValid from @plexica/auth/jwt
//   - rehydrateStatus, partializeAuthState from @plexica/auth/auth-store

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import { extractBaseProfile, isTokenValid } from '@plexica/auth/jwt';
import { rehydrateStatus, partializeAuthState } from '@plexica/auth/auth-store';

import { keycloakClient } from '../services/keycloak-auth.js';

import type { AdminUserProfile, AuthState } from '../types/auth.js';

interface AuthStore extends AuthState {
  // Actions
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
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
      userProfile: null,
      status: 'unauthenticated',
      isAuthenticated: false,

      login: async (username: string, password: string) => {
        set({ status: 'authenticating' });
        const tokens = await keycloakClient.loginWithPassword(username, password);
        const userProfile = decodeAdminProfile(tokens.access_token);
        set({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          userProfile,
          status: 'authenticated',
          isAuthenticated: true,
        });
      },

      logout: async () => {
        const { refreshToken } = get();
        if (refreshToken !== null) {
          await keycloakClient.revokeSession(refreshToken);
        }
        set({
          accessToken: null,
          refreshToken: null,
          userProfile: null,
          status: 'unauthenticated',
          isAuthenticated: false,
        });
        // Reload to reset router state and clear any cached queries.
        window.location.href = '/';
      },

      refresh: async () => {
        const { refreshToken } = get();
        if (refreshToken === null) throw new Error('Cannot refresh — no refresh token');
        const tokens = await keycloakClient.refreshTokens(refreshToken);
        const userProfile = decodeAdminProfile(tokens.access_token);
        set({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
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
