// File: packages/types/src/index.ts

/**
 * @plexica/types — Shared type definitions for the Plexica platform.
 *
 * This package is the single source of truth for TypeScript types used
 * across core-api, web, super-admin, plugins, and shared packages.
 */

// Tenant
export type { Tenant, TenantDetail, TenantStatus, TenantContext } from './tenant.js';
export { TENANT_STATUSES } from './tenant.js';

// User
export type { User, TenantUser, AdminUser, UserInfo } from './user.js';

// Workspace
export type {
  Workspace,
  WorkspaceMember,
  WorkspaceRole,
  Team,
  CreateWorkspaceInput,
  UpdateWorkspaceInput,
  AddMemberInput,
  UpdateMemberRoleInput,
} from './workspace.js';
export { WORKSPACE_ROLES } from './workspace.js';

// Plugin
export type {
  PluginStatus,
  PluginLifecycleStatus,
  TenantPluginStatus,
  PluginProps,
  PluginRoute,
  PluginMenuItem,
  PluginManifest,
  PluginLoaderManifest,
  PluginLoaderRoute,
  PluginLoaderMenuItem,
  LoadedPlugin,
  PluginLoadError,
  PluginEntity,
  PluginDetail,
  PluginVersion,
  PluginRating,
  TenantPlugin,
} from './plugin.js';
export { PLUGIN_STATUSES, PLUGIN_LIFECYCLE_STATUSES, TENANT_PLUGIN_STATUSES } from './plugin.js';

// Events
export type { DomainEvent, EventMetadata, EventHandlerFn } from './event.js';

// Auth
export type { AuthState } from './auth.js';

// Analytics
export type {
  AnalyticsOverview,
  TenantGrowthDataPoint,
  PluginUsageData,
  ApiCallMetrics,
} from './analytics.js';
