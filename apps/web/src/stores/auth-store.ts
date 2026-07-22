import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { createAuthFlowCoordinator } from '@plexica/auth/auth-flow';
import { createRehydrationHandler, partializeAuthState } from '@plexica/auth/auth-store';
import { extractBaseProfile } from '@plexica/auth/jwt';
import { createAuthorizationState } from '@plexica/auth/pkce';

import { keycloakClient, REDIRECT_URI } from '../services/keycloak-auth.js';

import type { UserProfile, AuthState } from '../types/auth.js';

interface AuthStore extends AuthState {
  login: () => Promise<void>;
  logout: () => Promise<void>;
  handleCallback: (code: string, state: string) => Promise<void>;
  refresh: () => Promise<void>;
  setSessionExpired: () => void;
  dismissExpired: () => void;
  setTenantContext: (slug: string, realm: string, uuid?: string) => void;
}

const authFlow = createAuthFlowCoordinator();

function decodeUserProfile(accessToken: string, realm: string): UserProfile {
  const profile: UserProfile = { ...extractBaseProfile(accessToken), realm };
  if (profile.roles.includes('tenant_admin')) profile.tenantRole = 'tenant_admin';
  else if (profile.roles.includes('member')) profile.tenantRole = 'member';
  return profile;
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
      tenantSlug: null,
      tenantUuid: null,
      realm: null,

      setTenantContext: (tenantSlug, realm, tenantUuid) => {
        set({ tenantSlug, tenantUuid: tenantUuid ?? null, realm });
      },

      login: () => {
        if (get().status === 'authenticated') return Promise.resolve();
        return authFlow.runLogin(async () => {
          const { realm } = get();
          if (realm === null) throw new Error('Tenant authentication is unavailable.');
          set({ status: 'authenticating' });
          try {
            const state = createAuthorizationState();
            sessionStorage.setItem('auth_state', state);
            const url = await keycloakClient.getLoginUrl(realm, state, REDIRECT_URI);
            window.location.href = url;
          } catch {
            set({ status: 'unauthenticated' });
            throw new Error('Authentication could not be started.');
          }
        });
      },

      logout: async () => {
        const { refreshToken, idToken, realm, tenantSlug } = get();
        const postLogoutUrl = new URL('/', window.location.origin);
        if (tenantSlug !== null) postLogoutUrl.searchParams.set('tenant', tenantSlug);
        try {
          if (refreshToken !== null && realm !== null) {
            await keycloakClient.revokeSession(refreshToken, realm);
          }
        } catch {
          // Front-channel logout below remains authoritative if revocation fails.
        } finally {
          set(clearedAuth);
          authFlow.reset();
          window.location.href =
            idToken === null || realm === null
              ? postLogoutUrl.href
              : keycloakClient.getLogoutUrl(realm, idToken, postLogoutUrl.href);
        }
      },

      handleCallback: (code, state) =>
        authFlow.runCallback(code, state, async () => {
          set({ status: 'authenticating' });
          const expectedState = sessionStorage.getItem('auth_state');
          const codeVerifier = sessionStorage.getItem('pkce_code_verifier');
          const { realm } = get();
          if (expectedState === null || state !== expectedState) {
            throw new Error('Invalid authentication state.');
          }
          if (realm === null || codeVerifier === null) {
            throw new Error('Authentication context is missing.');
          }

          const tokens = await keycloakClient.exchangeCode(code, realm, codeVerifier, REDIRECT_URI);
          sessionStorage.removeItem('pkce_code_verifier');
          sessionStorage.removeItem('auth_state');
          set({
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            idToken: tokens.id_token ?? null,
            userProfile: decodeUserProfile(tokens.access_token, realm),
            status: 'authenticated',
            isAuthenticated: true,
          });
        }),

      refresh: async () => {
        const { refreshToken, idToken, realm } = get();
        if (refreshToken === null || realm === null) {
          throw new Error('Session refresh is unavailable.');
        }
        const tokens = await keycloakClient.refreshTokens(refreshToken, realm);
        set({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          idToken: tokens.id_token ?? idToken,
          userProfile: decodeUserProfile(tokens.access_token, realm),
          status: 'authenticated',
          isAuthenticated: true,
        });
      },

      setSessionExpired: () => set({ ...clearedAuth, status: 'expired' }),
      dismissExpired: () => set({ status: 'unauthenticated' }),
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
      onRehydrateStorage: createRehydrationHandler(),
    }
  )
);
