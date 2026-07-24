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
const authEpoch = createAuthEpoch();

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
        const logoutUrl =
          realm === null
            ? postLogoutUrl.href
            : keycloakClient.getLogoutUrl(realm, idToken, postLogoutUrl.href);

        authEpoch.invalidate();
        set(clearedAuth);
        clearAuthQueryCache();
        clearAuthorizationRequests();
        authFlow.reset();
        try {
          if (refreshToken !== null && realm !== null) {
            await keycloakClient.revokeSession(refreshToken, realm);
          }
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
            const { realm } = get();
            if (realm === null) throw new Error('Authentication context is missing.');
            const tokens = await keycloakClient.exchangeCode(
              code,
              realm,
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
              userProfile: decodeUserProfile(tokens.access_token, realm),
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
        const { refreshToken, idToken, realm } = get();
        if (refreshToken === null || realm === null) {
          throw new Error('Session refresh is unavailable.');
        }
        const epoch = authEpoch.capture();
        const tokens = await keycloakClient.refreshTokens(refreshToken, realm);
        if (!authEpoch.isCurrent(epoch) || get().refreshToken !== refreshToken) return;
        set({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          idToken: tokens.id_token ?? idToken,
          userProfile: decodeUserProfile(tokens.access_token, realm),
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
