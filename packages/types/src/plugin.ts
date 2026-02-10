// File: packages/types/src/plugin.ts

// ---------------------------------------------------------------------------
// Plugin status
// ---------------------------------------------------------------------------

/**
 * Plugin registry status (lifecycle of a plugin in the marketplace).
 * Uses UPPERCASE to match Prisma/database convention.
 */
export const PLUGIN_STATUSES = [
  'DRAFT',
  'PENDING_REVIEW',
  'PUBLISHED',
  'REJECTED',
  'DEPRECATED',
] as const;

export type PluginStatus = (typeof PLUGIN_STATUSES)[number];

/**
 * Status of a plugin installation within a tenant.
 */
export const TENANT_PLUGIN_STATUSES = ['ACTIVE', 'INACTIVE'] as const;

export type TenantPluginStatus = (typeof TENANT_PLUGIN_STATUSES)[number];

// ---------------------------------------------------------------------------
// Plugin props (passed by the host to every plugin frontend component)
// ---------------------------------------------------------------------------

/**
 * Props injected by the host into every plugin component via Module Federation.
 * This is THE canonical interface for plugin ↔ host communication.
 */
export interface PluginProps {
  tenantId: string;
  userId: string;
  workspaceId?: string;
}

// ---------------------------------------------------------------------------
// Plugin manifest (frontend plugins)
// ---------------------------------------------------------------------------

/**
 * A route contributed by a frontend plugin.
 */
export interface PluginRoute {
  /** URL path (e.g. `/plugins/crm/contacts`) */
  path: string;
  /** Name of the exported React component (e.g. `ContactsPage`) */
  componentName: string;
  /** Human-readable page title */
  title: string;
  /** Layout mode inside the host shell */
  layout?: 'default' | 'fullscreen' | 'minimal';
  /** Required permissions to access this route */
  permissions?: string[];
}

/**
 * A menu item contributed by a frontend plugin.
 */
export interface PluginMenuItem {
  /** Unique identifier for the menu item */
  id: string;
  /** Display label */
  label: string;
  /** Lucide icon name (e.g. `Users`, `BarChart3`) */
  icon?: string;
  /** Navigation path */
  path?: string;
  /** Nested sub-menu items */
  children?: PluginMenuItem[];
  /** Required permissions to see this item */
  permissions?: string[];
  /** Sort order (lower = higher in menu) */
  order?: number;
}

/**
 * Frontend plugin manifest — declared by every frontend plugin in `manifest.ts`.
 * Describes what routes, menu items, and permissions the plugin provides.
 */
export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  icon?: string;
  routes: PluginRoute[];
  menuItems: PluginMenuItem[];
  permissions?: string[];
}

// ---------------------------------------------------------------------------
// Plugin loader types (used by the host app to load plugins via Module Federation)
// ---------------------------------------------------------------------------

/**
 * Manifest shape used by the host's PluginLoader to load a plugin at runtime.
 * Extends the base manifest with the `remoteEntry` URL and makes routes/menuItems
 * optional (they may be loaded dynamically from the remote module).
 */
export interface PluginLoaderManifest {
  id: string;
  name: string;
  version: string;
  /** URL to the plugin's remoteEntry.js */
  remoteEntry: string;
  routes?: PluginLoaderRoute[];
  menuItems?: PluginLoaderMenuItem[];
}

/**
 * Simplified route used by the host plugin loader.
 */
export interface PluginLoaderRoute {
  path: string;
  /** Name of the exported component from the plugin */
  component: string;
}

/**
 * Simplified menu item used by the host plugin loader.
 */
export interface PluginLoaderMenuItem {
  label: string;
  path: string;
  icon?: string;
  order?: number;
}

/**
 * A plugin that has been loaded via Module Federation and is ready to render.
 */
export interface LoadedPlugin {
  manifest: PluginLoaderManifest;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  module: any;
  routes: PluginLoaderRoute[];
  menuItems: PluginLoaderMenuItem[];
}

/**
 * Error captured when a plugin fails to load.
 */
export interface PluginLoadError {
  pluginId: string;
  pluginName: string;
  error: Error;
  timestamp: Date;
}

// ---------------------------------------------------------------------------
// Plugin entity (database model representation)
// ---------------------------------------------------------------------------

/**
 * Base plugin entity — core fields present in all views.
 */
export interface PluginEntity {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  category: string;
  status: PluginStatus;
  icon?: string;
  homepage?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Full plugin entity as seen in the super-admin / marketplace context.
 * Includes all optional marketplace fields.
 */
export interface PluginDetail extends PluginEntity {
  longDescription?: string;
  authorEmail?: string;
  repository?: string;
  entryPoint?: string;
  tags?: string[];
  screenshots?: string[];
  demoUrl?: string;
  averageRating?: number;
  ratingCount?: number;
  downloadCount?: number;
  installCount?: number;
  publishedAt?: string;
  submittedAt?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  manifest?: Record<string, unknown>;
  versions?: PluginVersion[];
}

/**
 * A specific version of a plugin.
 */
export interface PluginVersion {
  id: string;
  pluginId: string;
  version: string;
  changelog: string;
  manifest: Record<string, unknown>;
  publishedAt: string;
  downloadCount: number;
  isLatest: boolean;
  assetUrl?: string;
}

/**
 * A rating/review for a plugin.
 */
export interface PluginRating {
  id: string;
  pluginId: string;
  tenantId: string;
  userId: string;
  rating: number;
  review?: string;
  helpful: number;
  notHelpful: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * A plugin installed in a specific tenant.
 */
export interface TenantPlugin {
  id: string;
  pluginId: string;
  tenantId: string;
  status: TenantPluginStatus;
  configuration: Record<string, unknown>;
  installedAt: string;
  plugin: PluginEntity;
}
