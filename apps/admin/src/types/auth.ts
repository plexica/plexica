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
  // Admin uses password grant (for now) — no id_token required.
  // After PKCE migration, id_token will be available via optional field.
}

export interface AuthState extends BaseAuthState<AdminUserProfile> {
  // Admin app has no tenant context.
  // After PKCE migration, add idToken.
}

export type { AuthStatus };
