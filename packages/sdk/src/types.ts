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
  /** Explicit allowlist of single-label internal service hostnames that may
   *  receive credentials over cleartext `http:` (Docker/K8s internal network,
   *  e.g. `core-api-e2e` — CWE-319 guard, F9). https: and loopback hosts are
   *  unaffected. Default empty — a single-label `http:` host is rejected
   *  unless listed here or `allowHttpInternal` is true. */
  allowHttpHosts?: string[];
  /** Opt-in escape hatch: allow cleartext `http:` to ANY single-label
   *  internal service hostname without enumerating each one. Default false
   *  (safest). */
  allowHttpInternal?: boolean;
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

/**
 * A JSON value: string, number, boolean, null, an array of JSON values, or a
 * string-keyed object of JSON values. Recursive definition so nested
 * notification metadata is fully typed (F10). No PII allowed in metadata
 * (Security §6).
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * Input for `PluginSDK.emitNotification()` (feature 006-05, ADR-035).
 * The type is automatically prefixed with `plugin.<slug>.` before being sent
 * to POST /api/v1/notifications/emit. Title/body keys are i18n keys resolved
 * by the UI — no PII in the payload.
 */
export interface EmitNotificationInput {
  /** Target user id (user_profile.user_id in the tenant schema). */
  userId: string;
  /** Notification type suffix (e.g. `contact_created` → `plugin.crm.contact_created`). */
  type: string;
  /** i18n title key, e.g. `notifications.plugin.crm.contact_created.title`. */
  titleKey: string;
  /** Optional interpolation params for the title message. */
  titleParams?: Record<string, string>;
  /** Optional i18n body key (resolved by the UI). */
  bodyKey?: string;
  /** Optional structured metadata (no PII), e.g. `{ link: "/contacts/123" }`. */
  metadata?: Record<string, JsonValue>;
}

/**
 * Result of `PluginSDK.emitNotification()` (ADR-035 Decision 5): the core
 * generates the notificationId at emission and returns it synchronously for
 * caller correlation; persistence + delivery are asynchronous via the consumer.
 */
export interface EmitNotificationResult {
  notificationId: string;
}
