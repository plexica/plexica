// auth.ts — Shared TypeScript types for admin authentication.
// Pure type definitions — no runtime logic.

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_expires_in: number;
  token_type: 'Bearer';
}

export interface AdminUserProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  realm: 'master';
  roles: string[];
}

export type AuthStatus = 'unauthenticated' | 'authenticating' | 'authenticated' | 'expired';

export interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  userProfile: AdminUserProfile | null;
  status: AuthStatus;
  isAuthenticated: boolean;
}
