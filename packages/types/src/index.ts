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
  PluginWidget,
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

// Fonts (ADR-020)
export type { FontDefinition, FontManifest } from './fonts.js';

// Layout Engine (Spec 014)
export { LAYOUT_ROLE_KEYS } from './layout-config.js';
export type {
  RoleKey,
  FieldVisibility,
  ColumnVisibility,
  LayoutScopeType,
  FieldOverride,
  SectionOverride,
  ColumnOverride,
  LayoutConfig,
  LayoutConfigSnapshot,
  ManifestField,
  ManifestSection,
  ManifestColumn,
  FormSchema,
  ResolvedField,
  ResolvedColumn,
  ResolvedSection,
  ResolvedLayout,
  ConfigurableFormSummary,
  SaveLayoutConfigInput,
} from './layout-config.js';
export {
  FONT_CATALOG,
  DEFAULT_HEADING_FONT,
  DEFAULT_BODY_FONT,
  FONT_IDS,
  isFontId,
} from './fonts.js';
