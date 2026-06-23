// auth.ts — Shared TypeScript types for authentication.
// Pure type definitions — no runtime logic.

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  id_token: string;
  expires_in: number;
  refresh_expires_in: number;
  token_type: 'Bearer';
}

export interface UserProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  realm: string;
  roles: string[];
  // Derived from roles at usage sites via roles.includes('tenant_admin').
  // May be absent for non-admin users.
  tenantRole?: 'tenant_admin' | 'member';
}

export type AuthStatus = 'unauthenticated' | 'authenticating' | 'authenticated' | 'expired';

export interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  idToken: string | null;
  userProfile: UserProfile | null;
  status: AuthStatus;
  isAuthenticated: boolean;
}
