// auth.ts — TypeScript types for the tenant web app authentication.
// Extends shared base types from @plexica/auth with web-specific fields.

import type {
  AuthStatus,
  BaseUserProfile,
  TokenResponse as BaseTokenResponse,
  AuthState as BaseAuthState,
} from '@plexica/auth/types';

export interface UserProfile extends BaseUserProfile {
  realm: string;
  /** Derived from roles. May be absent for non-admin users. */
  tenantRole?: 'tenant_admin' | 'member';
}

export interface TokenResponse extends BaseTokenResponse {
  /** PKCE flow always returns an id_token. */
  id_token: string;
}

export interface AuthState extends BaseAuthState<UserProfile> {
  idToken: string | null;
  tenantSlug: string | null;
  tenantUuid: string | null;
  /** Keycloak realm for this tenant (e.g. 'plexica-acme'). */
  realm: string | null;
}

export type { AuthStatus };
