// types.ts
// Shared TypeScript types for authentication across Plexica apps.
// Apps extend these base types with app-specific fields
// (e.g., tenantRole for web, realm: 'master' for admin).

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  /** Returned for the initial OIDC exchange; refresh responses may omit it. */
  id_token?: string;
  expires_in: number;
  refresh_expires_in: number;
  token_type: 'Bearer';
}

export interface BaseUserProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: string[];
}

export type AuthStatus = 'unauthenticated' | 'authenticating' | 'authenticated' | 'expired';

export interface AuthState<T extends BaseUserProfile = BaseUserProfile> {
  accessToken: string | null;
  refreshToken: string | null;
  userProfile: T | null;
  status: AuthStatus;
  isAuthenticated: boolean;
}
