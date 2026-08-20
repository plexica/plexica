// create-auth-store-actions.ts
// The concrete auth action implementations injected into the Zustand store by
// createAuthStore. Split from create-auth-store.ts (Constitution Rule 4 —
// no file above 200 lines). The builder is invoked once per store creation,
// inside the create() callback where `set`/`get` are bound.
//
// No state lives here: the returned object is pure construction. The shared
// `clearedAuth` base is returned alongside the actions so the caller can
// spread it first (sessionStorage rehydration overwrites it per-field).

import { createAuthEpoch } from './auth-epoch.js';
import { createAuthFlowCoordinator } from './auth-flow.js';
import {
  clearAuthorizationRequests,
  consumeAuthorizationRequest,
} from './authorization-request.js';
import { createAuthorizationState } from './pkce.js';

import type { KeycloakClient } from './keycloak-client.js';
import type { BaseUserProfile } from './types.js';

/** Everything the actions need beyond the store's own set/get. */
export interface AuthActionsDeps<T extends BaseUserProfile, S extends object> {
  keycloakClient: KeycloakClient;
  redirectUri: string;
  realmResolver: (state: S) => string | null;
  decodeProfile: (accessToken: string, realm: string) => T;
  postLogoutUrlBuilder: (state: S) => string;
  onClearAuth?: (() => void) | undefined;
}

/**
 * Builds the auth actions (and the clearedAuth base) for a store instance.
 * Called once inside the persist create() callback, so set/get are stable
 * for the store's lifetime. The flow/epoch coordinators are per-store, not
 * per-call: concurrent login/callback/refresh racing is serialised on them.
 */
export function createAuthActions<T extends BaseUserProfile, S extends object>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  set: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get: any,
  deps: AuthActionsDeps<T, S>,
): object {
  const { keycloakClient, redirectUri, realmResolver, decodeProfile, postLogoutUrlBuilder, onClearAuth } =
    deps;

  const authFlow = createAuthFlowCoordinator();
  const authEpoch = createAuthEpoch();

  const clearedAuth = {
    accessToken: null,
    refreshToken: null,
    idToken: null,
    userProfile: null,
    status: 'unauthenticated' as const,
    isAuthenticated: false,
  };

  return {
    ...clearedAuth,

    login: () => {
      if (get().status === 'authenticated') return Promise.resolve();
      return authFlow.runLogin(async () => {
        const realm = realmResolver(get() as S);
        if (realm === null) throw new Error('Authentication is unavailable.');
        set({ status: 'authenticating' });
        try {
          const state = createAuthorizationState();
          const url = await keycloakClient.getLoginUrl(realm, state, redirectUri);
          window.location.href = url;
        } catch {
          set({ status: 'unauthenticated' });
          throw new Error('Authentication could not be started.');
        }
      });
    },

    logout: async () => {
      const state = get() as S;
      const { refreshToken, idToken } = get();
      const realm = realmResolver(state);
      const postLogoutUri = postLogoutUrlBuilder(state);

      authEpoch.invalidate();
      set({ ...clearedAuth });
      onClearAuth?.();
      clearAuthorizationRequests();
      authFlow.reset();
      try {
        if (refreshToken !== null && realm !== null) {
          await keycloakClient.revokeSession(refreshToken, realm);
        }
      } catch {
        // RP-initiated logout remains authoritative when revocation fails.
      }
      authEpoch.invalidate();
      set({ ...clearedAuth });
      onClearAuth?.();
      clearAuthorizationRequests();
      authFlow.reset();
      window.location.href =
        idToken === null || realm === null
          ? postLogoutUri
          : keycloakClient.getLogoutUrl(realm, idToken, postLogoutUri);
    },

    handleCallback: (code: string, stateParam: string) =>
      authFlow.runCallback(code, stateParam, async () => {
        const epoch = authEpoch.capture();
        set({ status: 'authenticating' });
        try {
          const { codeVerifier, nonce } = consumeAuthorizationRequest(stateParam);
          const realm = realmResolver(get() as S);
          if (realm === null) throw new Error('Authentication context is missing.');
          const tokens = await keycloakClient.exchangeCode(
            code,
            realm,
            codeVerifier,
            redirectUri,
            nonce,
          );
          if (!authEpoch.isCurrent(epoch)) return;
          clearAuthorizationRequests();
          authEpoch.invalidate();
          set({
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            idToken: tokens.id_token ?? null,
            userProfile: decodeProfile(tokens.access_token, realm),
            status: 'authenticated',
            isAuthenticated: true,
          });
        } catch (error) {
          if (authEpoch.isCurrent(epoch)) {
            authEpoch.invalidate();
            set({ ...clearedAuth });
          }
          throw error;
        }
      }),

    refresh: async () => {
      const state = get() as S;
      const { refreshToken, idToken } = get();
      if (refreshToken === null) throw new Error('Session refresh is unavailable.');
      const realm = realmResolver(state);
      if (realm === null) throw new Error('Session refresh is unavailable.');
      const epoch = authEpoch.capture();
      const tokens = await keycloakClient.refreshTokens(refreshToken, realm);
      if (!authEpoch.isCurrent(epoch) || get().refreshToken !== refreshToken) return;
      set({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        idToken: tokens.id_token ?? idToken,
        userProfile: decodeProfile(tokens.access_token, realm),
        status: 'authenticated',
        isAuthenticated: true,
      });
    },

    setSessionExpired: () => {
      authEpoch.invalidate();
      set({ ...clearedAuth, status: 'expired' });
      onClearAuth?.();
      clearAuthorizationRequests();
      authFlow.reset();
    },
    dismissExpired: () => {
      set({ status: 'unauthenticated' });
    },
  };
}