// auth.ts — TypeScript types for the admin app authentication.
// Extends shared base types from @plexica/auth with admin-specific fields.

import type {
  AuthStatus,
  BaseUserProfile,
  TokenResponse as BaseTokenResponse,
  AuthState as BaseAuthState,
} from '@plexica/auth/types';

export interface AdminUserProfile extends BaseUserProfile {
  /** Admin always authenticates against the master realm. */
  realm: 'master';
}

export interface TokenResponse extends BaseTokenResponse {
  /** PKCE flow returns an id_token. Required after PKCE migration. */
  id_token: string;
}

export interface AuthState extends BaseAuthState<AdminUserProfile> {
  /** ID token from the PKCE flow. */
  idToken: string | null;
}

export type { AuthStatus };
