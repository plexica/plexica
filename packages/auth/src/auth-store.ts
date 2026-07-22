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
 * Usage:
 *   onRehydrateStorage: () => (state) => {
 *     if (state === undefined) return;
 *     (state as Record<string, unknown>).status = rehydrateStatus(state.accessToken);
 *     (state as Record<string, unknown>).isAuthenticated = isTokenValid(state.accessToken ?? '');
 *   }
 */
export function rehydrateStatus(accessToken: string | null): AuthStatus {
  if (accessToken === null) return 'unauthenticated';
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
      set({ status: 'expired' as AuthStatus, isAuthenticated: false });
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
