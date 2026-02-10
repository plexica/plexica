// File: packages/types/src/user.ts

/**
 * Base user type — minimal fields present in all contexts.
 */
export interface User {
  id: string;
  email: string;
  name: string;
  roles: string[];
}

/**
 * User within a tenant context — includes tenant association.
 */
export interface TenantUser extends User {
  tenantId: string;
  permissions: string[];
}

/**
 * User as seen by the super-admin — includes administrative fields.
 */
export interface AdminUser extends TenantUser {
  tenantName?: string;
  tenantSlug?: string;
  status?: string;
  lastLogin?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * User info extracted from a Keycloak JWT token.
 */
export interface UserInfo {
  id: string;
  username: string;
  email?: string;
  emailVerified?: boolean;
  name?: string;
  firstName?: string;
  lastName?: string;
  roles: string[];
}
