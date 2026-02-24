// apps/core-api/src/modules/authorization/constants.ts
//
// Spec 003 §4 FR-001–FR-003, FR-005; §5 NFR-007, NFR-009, NFR-010
//
// Central constants for the authorization module:
//   - Core permission keys (colon-separated, FR-001)
//   - System role names
//   - Redis cache key templates (Appendix B)
//   - Limit and TTL constants

// ---------------------------------------------------------------------------
// Core permission keys — format: resource:action (FR-001)
// ---------------------------------------------------------------------------

export const CORE_PERMISSIONS = {
  // User management
  USERS_READ: 'users:read',
  USERS_WRITE: 'users:write',

  // Role / authorization management
  ROLES_READ: 'roles:read',
  ROLES_WRITE: 'roles:write',

  // ABAC policy management
  POLICIES_READ: 'policies:read',
  POLICIES_WRITE: 'policies:write',

  // Workspace management
  WORKSPACES_READ: 'workspaces:read',
  WORKSPACES_WRITE: 'workspaces:write',

  // Tenant settings
  SETTINGS_READ: 'settings:read',
  SETTINGS_WRITE: 'settings:write',

  // Plugin management
  PLUGINS_READ: 'plugins:read',
  PLUGINS_WRITE: 'plugins:write',
} as const;

export type CorePermissionKey = (typeof CORE_PERMISSIONS)[keyof typeof CORE_PERMISSIONS];

// ---------------------------------------------------------------------------
// System role names (FR-003, FR-004)
// ---------------------------------------------------------------------------

export const SYSTEM_ROLES = {
  SUPER_ADMIN: 'super_admin',
  TENANT_ADMIN: 'tenant_admin',
  TEAM_ADMIN: 'team_admin',
  USER: 'user',
} as const;

export type SystemRoleName = (typeof SYSTEM_ROLES)[keyof typeof SYSTEM_ROLES];

// ---------------------------------------------------------------------------
// System role → permission mappings (used when seeding a new tenant schema)
// ---------------------------------------------------------------------------

export const SYSTEM_ROLE_PERMISSIONS: Record<SystemRoleName, CorePermissionKey[]> = {
  [SYSTEM_ROLES.SUPER_ADMIN]: [
    CORE_PERMISSIONS.USERS_READ,
    CORE_PERMISSIONS.USERS_WRITE,
    CORE_PERMISSIONS.ROLES_READ,
    CORE_PERMISSIONS.ROLES_WRITE,
    CORE_PERMISSIONS.POLICIES_READ,
    CORE_PERMISSIONS.POLICIES_WRITE,
    CORE_PERMISSIONS.WORKSPACES_READ,
    CORE_PERMISSIONS.WORKSPACES_WRITE,
    CORE_PERMISSIONS.SETTINGS_READ,
    CORE_PERMISSIONS.SETTINGS_WRITE,
    CORE_PERMISSIONS.PLUGINS_READ,
    CORE_PERMISSIONS.PLUGINS_WRITE,
  ],
  [SYSTEM_ROLES.TENANT_ADMIN]: [
    CORE_PERMISSIONS.USERS_READ,
    CORE_PERMISSIONS.USERS_WRITE,
    CORE_PERMISSIONS.ROLES_READ,
    CORE_PERMISSIONS.ROLES_WRITE,
    CORE_PERMISSIONS.POLICIES_READ,
    CORE_PERMISSIONS.POLICIES_WRITE,
    CORE_PERMISSIONS.WORKSPACES_READ,
    CORE_PERMISSIONS.WORKSPACES_WRITE,
    CORE_PERMISSIONS.SETTINGS_READ,
    CORE_PERMISSIONS.SETTINGS_WRITE,
    CORE_PERMISSIONS.PLUGINS_READ,
    CORE_PERMISSIONS.PLUGINS_WRITE,
  ],
  [SYSTEM_ROLES.TEAM_ADMIN]: [
    CORE_PERMISSIONS.USERS_READ,
    CORE_PERMISSIONS.USERS_WRITE,
    CORE_PERMISSIONS.ROLES_READ,
    CORE_PERMISSIONS.WORKSPACES_READ,
    CORE_PERMISSIONS.WORKSPACES_WRITE,
    CORE_PERMISSIONS.PLUGINS_READ,
  ],
  [SYSTEM_ROLES.USER]: [
    CORE_PERMISSIONS.USERS_READ,
    CORE_PERMISSIONS.WORKSPACES_READ,
    CORE_PERMISSIONS.PLUGINS_READ,
  ],
} as const;

// ---------------------------------------------------------------------------
// Redis cache key templates (Appendix B)
// ---------------------------------------------------------------------------

/**
 * Returns the Redis key for a user's effective permissions within a tenant.
 * Pattern: `authz:perms:{tenantId}:{userId}`
 */
export function permsCacheKey(tenantId: string, userId: string): string {
  return `authz:perms:${tenantId}:${userId}`;
}

/**
 * Returns the Redis key for the SET of user IDs assigned to a role.
 * Pattern: `authz:role_users:{tenantId}:{roleId}`
 */
export function roleUsersCacheKey(tenantId: string, roleId: string): string {
  return `authz:role_users:${tenantId}:${roleId}`;
}

/**
 * Returns the Redis key for the rate limit counter for authorization mutations.
 * Pattern: `authz:ratelimit:{tenantId}`
 */
export function authzRateLimitKey(tenantId: string): string {
  return `authz:ratelimit:${tenantId}`;
}

/**
 * Returns a glob pattern for scanning all permission cache keys of a tenant.
 * Used by `invalidateForTenant()`.
 */
export function permsKeyPattern(tenantId: string): string {
  return `authz:perms:${tenantId}:*`;
}

// ---------------------------------------------------------------------------
// Cache TTL constants (NFR-007, NFR-008)
// ---------------------------------------------------------------------------

/** Base TTL for cached user permissions (seconds) */
export const CACHE_BASE_TTL = 300 as const;

/** Maximum jitter added/subtracted from base TTL to avoid stampede (seconds) */
export const CACHE_JITTER = 30 as const;

/** Safety fallback TTL if EXPIRE fails — ensures no stale data persists forever */
export const CACHE_SAFETY_TTL = 900 as const;

/** Debounce window for role-level cache invalidation (milliseconds, NFR-010) */
export const CACHE_INVALIDATION_DEBOUNCE_MS = 500 as const;

// ---------------------------------------------------------------------------
// Rate limit constants (NFR-010)
// ---------------------------------------------------------------------------

/** Sliding window duration in seconds */
export const RATE_LIMIT_WINDOW = 60 as const;

/** Max authorization mutation requests per tenant per window */
export const RATE_LIMIT_MAX = 60 as const;

// ---------------------------------------------------------------------------
// Business rule limits (NFR-009)
// ---------------------------------------------------------------------------

/** Maximum number of custom (non-system) roles per tenant */
export const MAX_CUSTOM_ROLES = 50 as const;
