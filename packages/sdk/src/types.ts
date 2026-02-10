// File: packages/sdk/src/types.ts

/**
 * @plexica/sdk — SDK type definitions
 *
 * Types specific to the SDK runtime. Domain types (PluginManifest, DomainEvent, etc.)
 * are re-exported from @plexica/types.
 */

import type { DomainEvent, EventMetadata } from '@plexica/types';

// ---------------------------------------------------------------------------
// Plugin Context — runtime context available to every plugin
// ---------------------------------------------------------------------------

/**
 * Runtime context passed to a PlexicaPlugin instance.
 * Contains the identity of the current plugin and the tenant it's operating in.
 */
export interface PluginContext {
  /** Unique plugin identifier (e.g. "plugin-crm") */
  pluginId: string;
  /** Current tenant ID */
  tenantId: string;
  /** Current workspace ID (if applicable) */
  workspaceId?: string;
  /** Authenticated user ID (if available) */
  userId?: string;
}

// ---------------------------------------------------------------------------
// Plugin Configuration
// ---------------------------------------------------------------------------

/**
 * Configuration for initializing a PlexicaPlugin.
 */
export interface PluginConfig {
  /** Unique plugin identifier */
  pluginId: string;
  /** Human-readable name */
  name: string;
  /** Semantic version */
  version: string;
  /** Core API base URL (e.g. "http://localhost:4000") */
  apiBaseUrl: string;
  /** Event bus broker URLs (e.g. ["localhost:9092"]) */
  eventBusBrokers?: string[];
  /** Plugin backend server port */
  port?: number;
  /** Plugin backend server host */
  host?: string;
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/**
 * Lifecycle hooks that a plugin can implement.
 */
export interface PluginLifecycle {
  /** Called when the plugin is installed for a tenant */
  onInstall?(context: PluginContext): Promise<void>;
  /** Called when the plugin is activated */
  onActivate?(context: PluginContext): Promise<void>;
  /** Called when the plugin is deactivated */
  onDeactivate?(context: PluginContext): Promise<void>;
  /** Called when the plugin is uninstalled */
  onUninstall?(context: PluginContext): Promise<void>;
  /** Called on each request to set up per-request context */
  onRequest?(context: PluginContext): Promise<void>;
}

// ---------------------------------------------------------------------------
// Service Registration
// ---------------------------------------------------------------------------

/**
 * An endpoint exposed by a plugin service.
 */
export interface ServiceEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  description?: string;
  permissions?: string[];
}

/**
 * A service that the plugin exposes for discovery by other plugins.
 */
export interface ServiceDefinition {
  /** Service name (e.g. "crm.contacts") */
  name: string;
  /** Service version (semver) */
  version: string;
  /** Base URL of the plugin backend */
  baseUrl: string;
  /** Description of the service */
  description?: string;
  /** Endpoints exposed by this service */
  endpoints: ServiceEndpoint[];
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * A discovered service returned by the service registry.
 */
export interface DiscoveredService {
  pluginId: string;
  name: string;
  version: string;
  baseUrl: string;
  endpoints: ServiceEndpoint[];
  health: 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE';
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// API Client
// ---------------------------------------------------------------------------

/**
 * Options for an API request.
 */
export interface ApiRequestOptions {
  /** HTTP method */
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Request headers */
  headers?: Record<string, string>;
  /** Request body (will be JSON-serialized) */
  body?: unknown;
  /** Query parameters */
  params?: Record<string, string | number | boolean | undefined>;
  /** Request timeout in milliseconds */
  timeout?: number;
}

/**
 * Typed API response.
 */
export interface ApiResponse<T = unknown> {
  /** Whether the request succeeded */
  success: boolean;
  /** Response data (on success) */
  data?: T;
  /** Total count (for list endpoints) */
  total?: number;
  /** Error message (on failure) */
  error?: string;
  /** Detailed error message */
  message?: string;
  /** HTTP status code */
  status: number;
}

// ---------------------------------------------------------------------------
// Shared Data
// ---------------------------------------------------------------------------

/**
 * Options for setting shared data.
 */
export interface SetSharedDataOptions {
  /** Time-to-live in seconds. If omitted, data does not expire. */
  ttl?: number;
  /** Whether other plugins can read this data. Default: true */
  isPublic?: boolean;
}

/**
 * A shared data entry returned by the shared data service.
 */
export interface SharedDataEntry<T = unknown> {
  key: string;
  value: T;
  namespace: string;
  ownerPluginId: string;
  isPublic: boolean;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Event Client
// ---------------------------------------------------------------------------

/**
 * Options for publishing an event.
 */
export interface PublishEventOptions {
  /** Override the workspace ID for this event */
  workspaceId?: string;
  /** Correlation ID for distributed tracing */
  correlationId?: string;
  /** ID of the event that caused this event */
  causationId?: string;
}

/**
 * Options for subscribing to events.
 */
export interface SubscribeEventOptions {
  /** Filter to a specific workspace */
  workspaceId?: string;
  /** Start reading from the earliest offset */
  fromBeginning?: boolean;
  /** Subscribe to another plugin's events (provide their plugin ID) */
  pluginId?: string;
  /** Subscribe to a core event (e.g. "core.tenant.created") */
  coreEvent?: boolean;
}

/**
 * Event handler function that receives a typed domain event.
 */
export type EventHandler<T = unknown> = (event: DomainEvent<T>) => Promise<void>;

// ---------------------------------------------------------------------------
// Plugin-to-Plugin API Call
// ---------------------------------------------------------------------------

/**
 * Request to call another plugin's API via the gateway.
 */
export interface PluginApiCallRequest {
  /** Target plugin ID */
  targetPluginId: string;
  /** Service name (e.g. "crm.contacts") */
  serviceName: string;
  /** HTTP method */
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Endpoint path (e.g. "/contacts") */
  path: string;
  /** Request body */
  body?: unknown;
  /** Query parameters */
  params?: Record<string, string | number | boolean>;
  /** Request headers */
  headers?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Re-export domain types from @plexica/types for convenience
// ---------------------------------------------------------------------------

export type { DomainEvent, EventMetadata };
export type {
  PluginManifest,
  PluginRoute,
  PluginMenuItem,
  PluginProps,
  PluginStatus,
  TenantPluginStatus,
  PluginEntity,
  TenantPlugin,
  Tenant,
  TenantContext,
  User,
  Workspace,
  WorkspaceMember,
  WorkspaceRole,
} from '@plexica/types';
