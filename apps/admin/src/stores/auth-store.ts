import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { createAuthFlowCoordinator } from '@plexica/auth/auth-flow';
import { createRehydrationHandler, partializeAuthState } from '@plexica/auth/auth-store';
import { extractBaseProfile } from '@plexica/auth/jwt';
import { createAuthorizationState } from '@plexica/auth/pkce';

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
            sessionStorage.setItem('auth_state', state);
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
        const postLogoutUri = `${window.location.origin}/`;
        try {
          if (refreshToken !== null) await keycloakClient.revokeSession(refreshToken);
        } catch {
          // Front-channel logout below remains authoritative if revocation fails.
        } finally {
          set(clearedAuth);
          authFlow.reset();
          window.location.href =
            idToken === null
              ? postLogoutUri
              : keycloakClient.getLogoutUrl('master', idToken, postLogoutUri);
        }
      },

      handleCallback: (code, state) =>
        authFlow.runCallback(code, state, async () => {
          set({ status: 'authenticating' });
          const expectedState = sessionStorage.getItem('auth_state');
          const codeVerifier = sessionStorage.getItem('pkce_code_verifier');
          if (expectedState === null || state !== expectedState) {
            throw new Error('Invalid authentication state.');
          }
          if (codeVerifier === null) throw new Error('PKCE verifier is missing.');

          const tokens = await keycloakClient.exchangeCode(
            code,
            'master',
            codeVerifier,
            REDIRECT_URI
          );
          sessionStorage.removeItem('pkce_code_verifier');
          sessionStorage.removeItem('auth_state');
          set({
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            idToken: tokens.id_token ?? null,
            userProfile: decodeAdminProfile(tokens.access_token),
            status: 'authenticated',
            isAuthenticated: true,
          });
        }),

      refresh: async () => {
        const { refreshToken, idToken } = get();
        if (refreshToken === null) throw new Error('Session refresh is unavailable.');
        const tokens = await keycloakClient.refreshTokens(refreshToken);
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
        set({ ...clearedAuth, status: 'expired' });
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
