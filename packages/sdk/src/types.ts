// types.ts
// TypeScript types for the Plugin SDK.

/**
 * Configuration object for initializing the PluginSDK.
 * Includes plugin identity, tenant context, connection strings, and optional callbacks.
 */
export interface PluginConfig {
  pluginId: string;
  /** Plugin slug — used to namespace emitted events as `plugin.<slug>.<type>`. */
  slug: string;
  tenantId: string;
  workspaceId?: string;
  /** @deprecated No longer required. SDK no longer connects to Kafka directly. Use apiUrl instead. */
  kafkaBrokers?: string;
  apiUrl: string;
  accessToken?: string; // Bearer token for API auth
  /** Service-account token injected by the platform as PLEXICA_SERVICE_TOKEN.
   *  Lets the plugin backend emit events without a user JWT. Auto-populated
   *  from the env var if not set explicitly. */
  serviceToken?: string;
  /** Installation ID injected by the platform as PLEXICA_INSTALL_ID. */
  installId?: string;
  dbConnectionString?: string; // Injected by platform runtime — overrides process.env.DATABASE_URL
  /** Optional error handler for background failures (e.g. idle DB pool errors).
   *  When omitted, background errors are silently ignored — plugins that want
   *  observability should pass a structured logger callback. */
  onError?: (error: Error) => void;
  // Context headers injected by the platform
  plexicaHeaders?: {
    tenantId?: string;
    userId?: string;
    workspaceId?: string;
    role?: string;
    correlationId?: string;
  };
}

/**
 * Execution context for the current plugin request.
 * Extracted from platform-injected headers or configuration fallbacks.
 */
export interface PluginContext {
  tenantId: string;
  userId: string;
  workspaceId: string | null;
  role: string;
}

/**
 * Event object received from the platform via the /_plexica/event endpoint.
 * Follows the core event schema v1 with producer, correlation, and causation tracking.
 */
export interface PluginEvent {
  eventId: string;
  type: string;
  schemaVersion: 1;
  tenantId: string;
  occurredAt: string;
  producer: { kind: 'core'; id: 'core' } | { kind: 'plugin'; id: string };
  payload: unknown;
  correlationId: string;
  causationId: string | null;
}

/**
 * Callback function signature for event handlers registered via sdk.onEvent().
 * Receives a PluginEvent and returns a Promise (async handlers supported).
 */
export type EventHandler = (event: PluginEvent) => Promise<void>;
