// types.ts
// TypeScript types for the Plugin SDK.

export interface PluginConfig {
  pluginId: string;
  /** Plugin slug — used to namespace emitted events as `plugin.<slug>.<type>`. */
  slug: string;
  tenantId: string;
  workspaceId?: string;
  /** @deprecated No longer required. SDK no longer connects to Kafka directly. Use apiUrl instead. */
  kafkaBrokers?: string;
  apiUrl: string;
  accessToken?: string;  // Bearer token for API auth
  /** Service-account token injected by the platform as PLEXICA_SERVICE_TOKEN.
   *  Lets the plugin backend emit events without a user JWT. Auto-populated
   *  from the env var if not set explicitly. */
  serviceToken?: string;
  /** Installation ID injected by the platform as PLEXICA_INSTALL_ID. */
  installId?: string;
  dbConnectionString?: string; // Injected by platform runtime — overrides process.env.DATABASE_URL
  // Context headers injected by the platform
  plexicaHeaders?: {
    tenantId?: string;
    userId?: string;
    workspaceId?: string;
    role?: string;
    correlationId?: string;
  };
}

export interface PluginContext {
  tenantId: string;
  userId: string;
  workspaceId: string | null;
  role: string;
}

export interface PluginEvent {
  type: string;
  payload: unknown;
  timestamp: string;
  correlationId: string;
}

export type EventHandler = (event: PluginEvent) => Promise<void>;
