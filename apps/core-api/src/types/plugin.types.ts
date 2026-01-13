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
  default?: any;
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
  configuration: Record<string, any>;
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
  userId?: string;
  pluginId: string;
  data: any;
}

/**
 * Plugin hook handler
 */
export type PluginHookHandler = (context: PluginHookContext) => Promise<any>;

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
