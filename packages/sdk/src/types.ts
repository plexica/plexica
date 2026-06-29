// types.ts
// TypeScript types for the Plugin SDK.

export interface PluginConfig {
  pluginId: string;
  tenantId: string;
  workspaceId?: string;
  /** @deprecated No longer required. SDK no longer connects to Kafka directly. Use apiUrl instead. */
  kafkaBrokers?: string;
  apiUrl: string;
  accessToken?: string;  // Bearer token for API auth
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
