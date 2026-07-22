// auth-store.ts
// Shared store slice factory for authentication state management.
// Provides the common state shape and actions that all Plexica apps need.
// Apps extend with app-specific fields (idToken, tenantSlug, etc.)
// and app-specific actions (login, handleCallback, setTenantContext).

import { type StateCreator } from 'zustand';

import { isTokenValid } from './jwt.js';

import type { AuthStatus, BaseUserProfile, TokenResponse } from './types.js';

// ---------------------------------------------------------------------------
// Rehydration helper — same pattern in all apps
// ---------------------------------------------------------------------------

/**
 * Shared rehydration logic for Zustand persist middleware.
 * Derives transient fields (status, isAuthenticated) from persisted tokens
 * by checking the JWT exp claim on page reload.
 *
 * When accessToken is null, the persisted status is preserved.
 * This is critical for the 'expired' status: when a user's session expires,
 * the status is set to 'expired' and persisted with null tokens. On page
 * reload, rehydration must preserve 'expired' so the SessionExpiredHandler
 * can show the toast before redirecting to Keycloak.
 *
 * Usage:
 *   onRehydrateStorage: () => (state) => {
 *     if (state === undefined) return;
 *     state.status = rehydrateStatus(state.accessToken, state.status);
 *     state.isAuthenticated = isTokenValid(state.accessToken ?? '');
 *   }
 */
export function rehydrateStatus(
  accessToken: string | null,
  persistedStatus?: AuthStatus,
): AuthStatus {
  if (accessToken === null) {
    // Preserve the persisted status (e.g. 'expired') so SessionExpiredHandler
    // can show the toast. Only fall back to 'unauthenticated' if no status
    // was persisted (first load).
    return persistedStatus ?? 'unauthenticated';
  }
  return isTokenValid(accessToken) ? 'authenticated' : 'unauthenticated';
}

// ---------------------------------------------------------------------------
// Shared state slice interface
// ---------------------------------------------------------------------------

export interface AuthBaseState<T extends BaseUserProfile = BaseUserProfile> {
  accessToken: string | null;
  refreshToken: string | null;
  userProfile: T | null;
  status: AuthStatus;
  isAuthenticated: boolean;
}

export const authBaseInitialState: AuthBaseState = {
  accessToken: null,
  refreshToken: null,
  userProfile: null,
  status: 'unauthenticated' as AuthStatus,
  isAuthenticated: false,
};

// ---------------------------------------------------------------------------
// Shared action creators
// ---------------------------------------------------------------------------

export interface AuthBaseActions<T extends BaseUserProfile> {
  /** Decode user profile from an access token and set auth state. */
  setTokens: (tokens: TokenResponse, profile: T) => void;

  /** Clear all auth state. */
  clearAuth: () => void;

  /** Mark session as expired (refresh failed). */
  setSessionExpired: () => void;

  /** Dismiss the expired banner and return to unauthenticated. */
  dismissExpired: () => void;
}

/**
 * Creates the shared auth actions that every Plexica auth store needs.
 * Returns a Zustand state creator (slice pattern) that can be merged into
 * the app-specific store.
 */
// Type-safe initial state builder
function createInitialState<T extends BaseUserProfile>(): AuthBaseState<T> {
  return {
    accessToken: null,
    refreshToken: null,
    userProfile: null,
    status: 'unauthenticated' as AuthStatus,
    isAuthenticated: false,
  };
}

export function createAuthBaseSlice<T extends BaseUserProfile>(
  decodeProfile: (accessToken: string) => T,
): StateCreator<
  AuthBaseState<T> & AuthBaseActions<T>,
  [],
  [],
  AuthBaseState<T> & AuthBaseActions<T>
> {
  return (set) => ({
    ...createInitialState<T>(),

    setTokens: (tokens: TokenResponse, profile?: T) => {
      const userProfile = profile ?? decodeProfile(tokens.access_token);
      set({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        userProfile,
        status: 'authenticated',
        isAuthenticated: true,
      });
    },

    clearAuth: () => {
      set({
        accessToken: null,
        refreshToken: null,
        userProfile: null,
        status: 'unauthenticated',
        isAuthenticated: false,
      });
    },

    setSessionExpired: () => {
      // Clear tokens so rehydration detects accessToken === null and
      // preserves the 'expired' status (via rehydrateStatus). Without this,
      // a page reload after session expiry would re-authenticate the user
      // silently because the store still holds valid tokens.
      set({
        accessToken: null,
        refreshToken: null,
        userProfile: null,
        status: 'expired' as AuthStatus,
        isAuthenticated: false,
      });
    },

    dismissExpired: () => {
      set({ status: 'unauthenticated' as AuthStatus });
    },
  });
}

// ---------------------------------------------------------------------------
// Utility: Partialize helper for Zustand persist
// ---------------------------------------------------------------------------

/**
 * Standard field picker for Zustand persist's `partialize`.
 * Persists only the fields needed for rehydration, excluding transient
 * derived fields (status, isAuthenticated).
 */
export function partializeAuthState(
  state: { accessToken: unknown; refreshToken: unknown; userProfile: unknown },
): Record<string, unknown> {
  const result: Record<string, unknown> = {
    accessToken: state.accessToken,
    refreshToken: state.refreshToken,
    userProfile: state.userProfile,
  };
  return result;
}

/**
 * Shared Zustand persist `onRehydrateStorage` handler.
 * Derives transient fields (status, isAuthenticated) from persisted tokens.
 *
 * When accessToken is null, preserves the persisted status (e.g. 'expired')
 * so the SessionExpiredHandler can show the toast before redirecting.
 *
 * IMPORTANT — Zustand persist contract: `onRehydrateStorage` is called
 * TWICE in different phases:
 *   1. Immediately, with the PRE-rehydration (initial/default) state — its
 *      return value is saved as a "post-rehydration callback".
 *   2. That returned callback is invoked AFTER storage is read and merged,
 *      with the FINAL rehydrated state.
 * This function must therefore return a FACTORY: `() => (state) => void`,
 * NOT a direct `(state) => void`. Returning the handler directly causes it
 * to run on the pre-rehydration state (a no-op) instead of mutating the
 * real, token-populated state — silently breaking rehydration.
 *
 * Usage in app auth stores:
 *   onRehydrateStorage: createRehydrationHandler()
 */
export function createRehydrationHandler<T extends { accessToken: string | null; status: AuthStatus; isAuthenticated: boolean }>() {
  return () => (state: T | undefined): void => {
    if (state === undefined) return;
    state.status = rehydrateStatus(state.accessToken, state.status);
    state.isAuthenticated = isTokenValid(state.accessToken ?? '');
  };
}
