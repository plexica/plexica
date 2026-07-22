import { type StateCreator } from 'zustand';

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

export const authBaseInitialState: AuthBaseState = {
  accessToken: null,
  refreshToken: null,
  userProfile: null,
  status: 'unauthenticated',
  isAuthenticated: false,
};

function createInitialState<T extends BaseUserProfile>(): AuthBaseState<T> {
  return {
    accessToken: null,
    refreshToken: null,
    userProfile: null,
    status: 'unauthenticated',
    isAuthenticated: false,
  };
}

export function createAuthBaseSlice<T extends BaseUserProfile>(
  decodeProfile: (accessToken: string) => T
): StateCreator<
  AuthBaseState<T> & AuthBaseActions<T>,
  [],
  [],
  AuthBaseState<T> & AuthBaseActions<T>
> {
  return (set) => ({
    ...createInitialState<T>(),
    setTokens: (tokens, profile) => {
      set({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        userProfile: profile ?? decodeProfile(tokens.access_token),
        status: 'authenticated',
        isAuthenticated: true,
      });
    },
    clearAuth: () => {
      set(createInitialState<T>());
    },
    setSessionExpired: () => {
      set({
        ...createInitialState<T>(),
        status: 'expired',
      });
    },
    dismissExpired: () => {
      set({ status: 'unauthenticated' });
    },
  });
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
