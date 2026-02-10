// apps/super-admin/src/types/index.ts
//
// Re-exports from @plexica/types.
// Aliases preserve the names that super-admin consumers already use.

// Tenant — status is now UPPERCASE ('ACTIVE' | 'PROVISIONING' | 'SUSPENDED' | …)
export type { Tenant, TenantStatus } from '@plexica/types';

// Plugin — PluginDetail has all marketplace fields the super-admin needs.
// Aliased as "Plugin" so every existing `import { Plugin } from '@/types'` keeps working.
export type { PluginDetail as Plugin, PluginVersion, PluginRating } from '@plexica/types';

// TenantPlugin — status is now UPPERCASE ('ACTIVE' | 'INACTIVE')
export type { TenantPlugin } from '@plexica/types';

// User — AdminUser adds permissions/tenantName/tenantSlug/status on top of TenantUser.
// Aliased as "User" for backward compat.
export type { AdminUser as User } from '@plexica/types';

// Analytics
export type { AnalyticsOverview } from '@plexica/types';
