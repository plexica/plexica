// auth-store.ts
// Single Zustand store for admin authentication state.
// Uses direct password grant against the Keycloak master realm (internal tool).
// No tenant context — admin routes bypass tenant resolution.
// Tokens are persisted in sessionStorage (cleared on browser close).

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import {
  loginWithPassword,
  refreshTokens,
  revokeSession,
} from '../services/keycloak-auth.js';

import type { AdminUserProfile, AuthState } from '../types/auth.js';

interface AuthStore extends AuthState {
  // Actions
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setSessionExpired: () => void;
  dismissExpired: () => void;
}

// Decode base64url (JWT uses - and _ instead of + and /) with UTF-8 support.
function decodeBase64Url(input: string): unknown {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

function decodeUserProfile(accessToken: string): AdminUserProfile {
  const parts = accessToken.split('.');
  const payload = decodeBase64Url(parts[1] ?? '') as Record<string, unknown>;
  return {
    id: String(payload['sub'] ?? ''),
    email: String(payload['email'] ?? ''),
    firstName: String(payload['given_name'] ?? ''),
    lastName: String(payload['family_name'] ?? ''),
    realm: 'master',
    roles: (payload['realm_access'] as { roles?: string[] } | undefined)?.roles ?? [],
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
        const tokens = await loginWithPassword(username, password);
        const userProfile = decodeUserProfile(tokens.access_token);
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
          await revokeSession(refreshToken);
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
        const tokens = await refreshTokens(refreshToken);
        const userProfile = decodeUserProfile(tokens.access_token);
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
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        userProfile: state.userProfile,
      }),
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
            } catch {
              // Malformed token payload — leave as unauthenticated.
            }
          }
        }
      },
    }
  )
);
