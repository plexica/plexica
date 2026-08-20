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

import { createAuthStoreImpl } from './create-auth-store-impl.js';
import { extractBaseProfile } from './jwt.js';

import type { StoreApi, UseBoundStore } from 'zustand';
import type { KeycloakClient } from './keycloak-client.js';
import type { BaseUserProfile } from './types.js';

// ─── Public types ───────────────────────────────────────────────────────────

/** The base auth state fields managed by the factory. */
export interface BaseAuthState<T extends BaseUserProfile> {
  accessToken: string | null;
  refreshToken: string | null;
  idToken: string | null;
  userProfile: T | null;
  status: import('./types.js').AuthStatus;
  isAuthenticated: boolean;
}

/** The standard auth actions provided by the factory. */
export interface BaseAuthActions {
  login: () => Promise<void>;
  logout: () => Promise<void>;
  handleCallback: (code: string, state: string) => Promise<void>;
  refresh: () => Promise<void>;
  setSessionExpired: () => void;
  dismissExpired: () => void;
}

export type AuthStoreState<T extends BaseUserProfile, S extends object> = S &
  BaseAuthState<T> &
  BaseAuthActions;

export type ExtraActionsFactory<T extends BaseUserProfile, S extends object> = (
  set: StoreApi<AuthStoreState<T, S>>['setState'],
  get: StoreApi<AuthStoreState<T, S>>['getState']
) => Partial<S>;

export interface AuthStoreConfig<T extends BaseUserProfile, S extends object> {
  keycloakClient: KeycloakClient;
  redirectUri: string;
  realmResolver: (state: S) => string | null;
  decodeProfile: (accessToken: string, realm: string) => T;
  postLogoutUrlBuilder: (state: S) => string;
  persistName: string;
  partializeExtra?: (state: S) => Record<string, unknown>;
  extraState?: Partial<S>;
  extraActions?: ExtraActionsFactory<T, S>;
  onClearAuth?: () => void;
}

// ─── Factory ────────────────────────────────────────────────────────────────

export function createAuthStore<T extends BaseUserProfile, S extends object = object>(
  config: AuthStoreConfig<T, S>
): UseBoundStore<StoreApi<AuthStoreState<T, S>>> {
  return createAuthStoreImpl(config);
}

export { extractBaseProfile };
