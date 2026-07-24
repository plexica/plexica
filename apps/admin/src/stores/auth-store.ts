import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { createAuthEpoch } from '@plexica/auth/auth-epoch';
import { createAuthFlowCoordinator } from '@plexica/auth/auth-flow';
import { createRehydrationHandler, partializeAuthState } from '@plexica/auth/auth-store';
import {
  clearAuthorizationRequests,
  consumeAuthorizationRequest,
} from '@plexica/auth/authorization-request';
import { extractBaseProfile } from '@plexica/auth/jwt';
import { createAuthorizationState } from '@plexica/auth/pkce';

import { clearAuthQueryCache } from '../services/auth-query-cache.js';
import { keycloakClient, REDIRECT_URI } from '../services/keycloak-auth.js';

import type { AdminUserProfile, AuthState } from '../types/auth.js';

interface AuthStore extends AuthState {
  login: () => Promise<void>;
  logout: () => Promise<void>;
  handleCallback: (code: string, state: string) => Promise<void>;
  refresh: () => Promise<void>;
  setSessionExpired: () => void;
  dismissExpired: () => void;
}

const authFlow = createAuthFlowCoordinator();
const authEpoch = createAuthEpoch();

function decodeAdminProfile(accessToken: string): AdminUserProfile {
  return { ...extractBaseProfile(accessToken), realm: 'master' };
}

const clearedAuth = {
  accessToken: null,
  refreshToken: null,
  idToken: null,
  userProfile: null,
  status: 'unauthenticated' as const,
  isAuthenticated: false,
};

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      ...clearedAuth,

      login: () => {
        if (get().status === 'authenticated') return Promise.resolve();
        return authFlow.runLogin(async () => {
          set({ status: 'authenticating' });
          try {
            const state = createAuthorizationState();
            const url = await keycloakClient.getLoginUrl('master', state, REDIRECT_URI);
            window.location.href = url;
          } catch {
            set({ status: 'unauthenticated' });
            throw new Error('Authentication could not be started.');
          }
        });
      },

      logout: async () => {
        const { refreshToken, idToken } = get();
        const postLogoutUri = `${window.location.origin}/login`;
        const logoutUrl = keycloakClient.getLogoutUrl('master', idToken, postLogoutUri);

        authEpoch.invalidate();
        set(clearedAuth);
        clearAuthQueryCache();
        clearAuthorizationRequests();
        authFlow.reset();
        try {
          if (refreshToken !== null) await keycloakClient.revokeSession(refreshToken);
        } catch {
          // RP-initiated logout remains authoritative when revocation fails or times out.
        }
        authEpoch.invalidate();
        set(clearedAuth);
        clearAuthQueryCache();
        clearAuthorizationRequests();
        authFlow.reset();
        window.location.href = logoutUrl;
      },

      handleCallback: (code, state) =>
        authFlow.runCallback(code, state, async () => {
          const epoch = authEpoch.capture();
          set({ status: 'authenticating' });
          try {
            const { codeVerifier, nonce } = consumeAuthorizationRequest(state);
            const tokens = await keycloakClient.exchangeCode(
              code,
              'master',
              codeVerifier,
              REDIRECT_URI,
              nonce
            );
            if (!authEpoch.isCurrent(epoch)) return;
            clearAuthorizationRequests();
            authEpoch.invalidate();
            set({
              accessToken: tokens.access_token,
              refreshToken: tokens.refresh_token,
              idToken: tokens.id_token ?? null,
              userProfile: decodeAdminProfile(tokens.access_token),
              status: 'authenticated',
              isAuthenticated: true,
            });
          } catch (error) {
            if (authEpoch.isCurrent(epoch)) {
              authEpoch.invalidate();
              set(clearedAuth);
            }
            throw error;
          }
        }),

      refresh: async () => {
        const { refreshToken, idToken } = get();
        if (refreshToken === null) throw new Error('Session refresh is unavailable.');
        const epoch = authEpoch.capture();
        const tokens = await keycloakClient.refreshTokens(refreshToken);
        if (!authEpoch.isCurrent(epoch) || get().refreshToken !== refreshToken) return;
        set({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          idToken: tokens.id_token ?? idToken,
          userProfile: decodeAdminProfile(tokens.access_token),
          status: 'authenticated',
          isAuthenticated: true,
        });
      },

      setSessionExpired: () => {
        authEpoch.invalidate();
        set({ ...clearedAuth, status: 'expired' });
        clearAuthQueryCache();
        clearAuthorizationRequests();
        authFlow.reset();
      },
      dismissExpired: () => {
        set({ status: 'unauthenticated' });
      },
    }),
    {
      name: 'plexica-admin-auth',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        ...partializeAuthState(state),
        idToken: state.idToken,
      }),
      onRehydrateStorage: createRehydrationHandler(),
    }
  )
);
