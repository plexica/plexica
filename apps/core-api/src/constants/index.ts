/**
 * Application Constants
 * Centralized definitions for magic strings and values
 */

// Tenant Constants
export const MASTER_TENANT_SLUG = 'master';

// Tenant Status
export const TENANT_STATUS = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  PROVISIONING: 'PROVISIONING',
  PENDING_DELETION: 'PENDING_DELETION',
} as const;

// Plugin Status
export const PLUGIN_STATUS = {
  AVAILABLE: 'AVAILABLE',
  INSTALLED: 'INSTALLED',
  DEPRECATED: 'DEPRECATED',
} as const;

// User Roles
export const USER_ROLES = {
  SUPER_ADMIN: 'super_admin',
  TENANT_OWNER: 'tenant_owner',
  ADMIN: 'admin',
  USER: 'user',
  GUEST: 'guest',
} as const;

// Permission Format
export const PERMISSION_FORMAT = {
  USERS_READ: 'users.read',
  USERS_WRITE: 'users.write',
  USERS_DELETE: 'users.delete',
  ROLES_READ: 'roles.read',
  ROLES_WRITE: 'roles.write',
  ROLES_DELETE: 'roles.delete',
  SETTINGS_READ: 'settings.read',
  SETTINGS_WRITE: 'settings.write',
  PLUGINS_READ: 'plugins.read',
  PLUGINS_WRITE: 'plugins.write',
} as const;

// Service Registry
export const SERVICE_STATUS = {
  HEALTHY: 'HEALTHY',
  DEGRADED: 'DEGRADED',
  UNAVAILABLE: 'UNAVAILABLE',
} as const;

// Validation Patterns
export const VALIDATION_PATTERNS = {
  TENANT_SLUG: /^[a-z0-9-]{1,50}$/,
  TENANT_SCHEMA: /^tenant_[a-z0-9_]{1,63}$/,
  PLUGIN_ID: /^[a-z0-9-]{1,64}$/,
  SEMVER: /^\d+\.\d+\.\d+$/,
} as const;

// Limits
export const LIMITS = {
  PLUGIN_ID_LENGTH: 64,
  PLUGIN_NAME_LENGTH: { MIN: 3, MAX: 255 },
  PLUGIN_DESCRIPTION_LENGTH: { MIN: 10, MAX: 1000 },
  TENANT_SLUG_LENGTH: { MIN: 1, MAX: 50 },
  FILE_UPLOAD_MAX_SIZE_MB: 50,
  PAGINATION_MAX_RESULTS: 500,
  PAGINATION_DEFAULT_RESULTS: 50,
} as const;

// Cache TTL (seconds)
export const CACHE_TTL = {
  SERVICE_REGISTRY: 300, // 5 minutes
  JWKS_KEYS: 86400, // 24 hours
} as const;
