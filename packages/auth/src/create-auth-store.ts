// create-auth-store.ts
// Factory that creates a complete Zustand auth store with persist middleware.
// Eliminates the 85% duplication between apps/web and apps/admin auth stores
// (Decision 8, 2026-08-18 — finding 04#2).
//
// The factory accepts app-specific differences via dependency injection:
// - realmResolver: how to get the realm from the current state
// - decodeProfile: how to decode an access token into a user profile
// - postLogoutUrlBuilder: how to build the URL Keycloak redirects to after logout
// - persistName: sessionStorage key for persistence
// - partializeExtra: extra fields to persist (e.g., tenantSlug for web)
// - extraState: additional initial state (e.g., tenant context for web)
// - extraActions: additional actions (e.g., setTenantContext for web)
// - onClearAuth: hook called when auth is cleared (e.g., clearAuthQueryCache)

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { createAuthEpoch } from './auth-epoch.js';
import { createAuthFlowCoordinator } from './auth-flow.js';
import {
  createRehydrationHandler,
  partializeAuthState,
} from './auth-store.js';
import {
  clearAuthorizationRequests,
  consumeAuthorizationRequest,
} from './authorization-request.js';
import { extractBaseProfile } from './jwt.js';
import { createAuthorizationState } from './pkce.js';

import type { KeycloakClient } from './keycloak-client.js';
import type {
  AuthStatus,
  BaseUserProfile,
  TokenResponse,
} from './types.js';

// ─── Public types ───────────────────────────────────────────────────────────

/** The base auth state fields managed by the factory. */
export interface BaseAuthState<T extends BaseUserProfile> {
  accessToken: string | null;
  refreshToken: string | null;
  idToken: string | null;
  userProfile: T | null;
  status: AuthStatus;
  isAuthenticated: boolean;
}

/** The standard auth actions provided by the factory. */
export interface BaseAuthActions<T extends BaseUserProfile> {
  login: () => Promise<void>;
  logout: () => Promise<void>;
  handleCallback: (code: string, state: string) => Promise<void>;
  refresh: () => Promise<void>;
  setSessionExpired: () => void;
  dismissExpired: () => void;
}

export interface AuthStoreConfig<T extends BaseUserProfile, S extends object> {
  keycloakClient: KeycloakClient;
  redirectUri: string;
  realmResolver: (state: S) => string | null;
  decodeProfile: (accessToken: string, realm: string) => T;
  postLogoutUrlBuilder: (state: S) => string;
  persistName: string;
  partializeExtra?: (state: S) => Record<string, unknown>;
  extraState?: object;
  extraActions?: object;
  onClearAuth?: () => void;
}

// ─── Factory ────────────────────────────────────────────────────────────────

export function createAuthStore<
  T extends BaseUserProfile,
  S extends object = object,
>(config: AuthStoreConfig<T, S>) {
  const {
    keycloakClient,
    redirectUri,
    realmResolver,
    decodeProfile,
    postLogoutUrlBuilder,
    persistName,
    partializeExtra,
    extraState,
    extraActions,
    onClearAuth,
  } = config;

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

  type StoreType = S & BaseAuthState<T> & BaseAuthActions<T>;

  return create<StoreType>()(
    persist(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((set: any, get: any) => ({
        ...clearedAuth,
        ...(extraState ?? {}),
        ...(extraActions ?? {}),

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
          const logoutUrl = postLogoutUrlBuilder(state);

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
          window.location.href = logoutUrl;
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any),
      {
        name: persistName,
        storage: createJSONStorage(() => sessionStorage),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        partialize: ((state: any) => ({
          ...partializeAuthState(state),
          idToken: state.idToken,
          ...(partializeExtra?.(state as S) ?? {}),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        })) as any,
        onRehydrateStorage: createRehydrationHandler,
      },
    ),
  );
}

export { extractBaseProfile };
