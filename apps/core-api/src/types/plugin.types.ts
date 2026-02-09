/**
 * Plugin System Types
 *
 * Defines the structure and types for the Plexica plugin system
 */

/**
 * Plugin category
 */
export enum PluginCategory {
  AUTHENTICATION = 'authentication',
  ANALYTICS = 'analytics',
  COMMUNICATION = 'communication',
  CRM = 'crm',
  ECOMMERCE = 'ecommerce',
  FINANCE = 'finance',
  HR = 'hr',
  INTEGRATION = 'integration',
  PRODUCTIVITY = 'productivity',
  STORAGE = 'storage',
  UTILITY = 'utility',
  OTHER = 'other',
}

/**
 * Plugin lifecycle status
 */
export enum PluginLifecycleStatus {
  REGISTERED = 'registered',
  INSTALLING = 'installing',
  INSTALLED = 'installed',
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  FAILED = 'failed',
  UNINSTALLING = 'uninstalling',
}

/**
 * Plugin permission required
 */
export interface PluginPermission {
  resource: string;
  action: string;
  description: string;
}

/**
 * Plugin configuration field
 */
export interface PluginConfigField {
  key: string;
  type: 'string' | 'number' | 'boolean' | 'select' | 'multiselect' | 'json';
  label: string;
  description?: string;
  required?: boolean;
  default?: unknown;
  options?: Array<{ value: string; label: string }>;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    message?: string;
  };
}

/**
 * Plugin hook/event definition
 */
export interface PluginHook {
  name: string;
  description: string;
  parameters?: Record<string, string>;
}

/**
 * Plugin API endpoint definition
 */
export interface PluginEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  description: string;
  requiresAuth?: boolean;
  permissions?: string[];
}

/**
 * Plugin API Service Definition (M2.3 - Plugin-to-Plugin Communication)
 * Defines a service that the plugin exposes to other plugins
 */
export interface PluginApiService {
  /** Unique service name (e.g., "crm.contacts", "analytics.reports") */
  name: string;
  /** Service version (semver) */
  version: string;
  /** Optional base URL override (defaults to plugin's backend URL) */
  baseUrl?: string;
  /** Service description */
  description?: string;
  /** API endpoints exposed by this service */
  endpoints: Array<{
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    path: string;
    description?: string;
    /** Required permissions to call this endpoint */
    permissions?: string[];
    /** Custom metadata for the endpoint */
    metadata?: Record<string, unknown>;
  }>;
  /** Service-level metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Plugin API Dependency (M2.3 - Plugin-to-Plugin Communication)
 * Declares that this plugin depends on another plugin's API
 */
export interface PluginApiDependency {
  /** The plugin ID this plugin depends on */
  pluginId: string;
  /** Optional specific service name (if only consuming one service) */
  serviceName?: string;
  /** Version constraint (semver range, e.g., "^1.0.0", ">=2.0.0") */
  version: string;
  /** Whether this dependency is required for the plugin to function */
  required: boolean;
  /** Description of why this dependency is needed */
  reason?: string;
}

/**
 * Plugin frontend module
 */
export interface PluginFrontendModule {
  name: string;
  entry: string;
  scope: string;
  type: 'component' | 'page' | 'widget' | 'layout';
  route?: string;
  icon?: string;
  menu?: {
    label: string;
    position?: number;
    parent?: string;
  };
}

/**
 * Plugin dependencies
 */
export interface PluginDependencies {
  required?: Record<string, string>; // pluginId -> version
  optional?: Record<string, string>;
  conflicts?: string[]; // plugin IDs that conflict
}

/**
 * Plugin metadata
 */
export interface PluginMetadata {
  author: {
    name: string;
    email?: string;
    url?: string;
  };
  repository?: string;
  homepage?: string;
  license: string;
  keywords?: string[];
  screenshots?: string[];
}

/**
 * Complete Plugin Manifest
 * This is the structure of the plugin.json file
 */
export interface PluginManifest {
  // Basic info
  id: string;
  name: string;
  version: string;
  description: string;
  category: PluginCategory;

  // Metadata
  metadata: PluginMetadata;

  // Configuration
  config?: PluginConfigField[];

  // Permissions required
  permissions?: PluginPermission[];

  // Dependencies
  dependencies?: PluginDependencies;

  // Backend integration
  backend?: {
    entry?: string;
    hooks?: PluginHook[];
    endpoints?: PluginEndpoint[];
    migrations?: string[];
  };

  // Frontend integration
  frontend?: {
    modules?: PluginFrontendModule[];
    assets?: string[];
  };

  // API Communication (M2.3 - Plugin-to-Plugin Communication)
  api?: {
    /** Services exposed by this plugin for other plugins to consume */
    services?: PluginApiService[];
    /** Other plugins this plugin depends on */
    dependencies?: PluginApiDependency[];
  };

  // Lifecycle hooks
  lifecycle?: {
    install?: string;
    uninstall?: string;
    activate?: string;
    deactivate?: string;
  };
}

/**
 * Plugin installation status
 */
export interface PluginInstallation {
  id: string;
  tenantId: string;
  pluginId: string;
  status: PluginLifecycleStatus;
  version: string;
  configuration: Record<string, unknown>;
  enabled: boolean;
  installedAt: Date;
  lastActivated?: Date;
  error?: string;
}

/**
 * Plugin hook context
 * Passed to plugin hook handlers
 */
export interface PluginHookContext {
  tenantId: string;
  workspaceId?: string;
  userId?: string;
  pluginId: string;
  data: unknown;

  // Event capabilities (added in M2.1)
  events?: {
    publish: <T = unknown>(
      eventName: string,
      data: T,
      options?: {
        workspaceId?: string;
        correlationId?: string;
        causationId?: string;
      }
    ) => Promise<void>;

    subscribe: (
      eventName: string,
      handler: (event: unknown) => Promise<void>,
      options?: {
        workspaceId?: string;
        fromBeginning?: boolean;
      }
    ) => Promise<string>; // Returns subscription ID

    unsubscribe: (subscriptionId: string) => Promise<void>;
  };
}

/**
 * Plugin hook handler
 */
export type PluginHookHandler = (context: PluginHookContext) => Promise<unknown>;

/**
 * Plugin registry entry
 */
export interface PluginRegistryEntry {
  manifest: PluginManifest;
  status: 'available' | 'deprecated' | 'disabled';
  downloadUrl?: string;
  installCount?: number;
  rating?: number;
  createdAt: Date;
  updatedAt: Date;
}
