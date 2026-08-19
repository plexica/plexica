// auth-store.ts
// Shared auth store utilities: rehydration, partialization, and state interfaces.
// The createAuthBaseSlice factory was integrated into createAuthStore
// (Decision 8, 2026-08-18) and is no longer exported separately.

import { isTokenValid } from './jwt.js';

import type { AuthStatus, BaseUserProfile, TokenResponse } from './types.js';

export interface AuthBaseState<T extends BaseUserProfile = BaseUserProfile> {
  accessToken: string | null;
  refreshToken: string | null;
  userProfile: T | null;
  status: AuthStatus;
  isAuthenticated: boolean;
}

export interface AuthBaseActions<T extends BaseUserProfile> {
  setTokens: (tokens: TokenResponse, profile?: T) => void;
  clearAuth: () => void;
  setSessionExpired: () => void;
  dismissExpired: () => void;
}

export function rehydrateStatus(
  accessToken: string | null,
  persistedStatus?: AuthStatus
): AuthStatus {
  if (accessToken === null) {
    return persistedStatus === 'expired' ? 'expired' : 'unauthenticated';
  }
  return isTokenValid(accessToken) ? 'authenticated' : 'unauthenticated';
}

interface PersistedAuthFields {
  accessToken: unknown;
  refreshToken: unknown;
  userProfile: unknown;
  status: AuthStatus;
}

export function partializeAuthState(state: PersistedAuthFields): Record<string, unknown> {
  const result: Record<string, unknown> = {
    accessToken: state.accessToken,
    refreshToken: state.refreshToken,
    userProfile: state.userProfile,
  };
  if (state.status === 'expired') result['status'] = 'expired';
  return result;
}

interface RehydratableAuthState {
  accessToken: string | null;
  status: AuthStatus;
  isAuthenticated: boolean;
}

export function createRehydrationHandler<T extends RehydratableAuthState>() {
  return () =>
    (state: T | undefined): void => {
      if (state === undefined) return;
      state.status = rehydrateStatus(state.accessToken, state.status);
      state.isAuthenticated = isTokenValid(state.accessToken ?? '');
    };
}
