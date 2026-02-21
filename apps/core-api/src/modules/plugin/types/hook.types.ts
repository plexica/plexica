// apps/core-api/src/modules/plugin/types/hook.types.ts
//
// Type definitions for the plugin hook system.
// Used by PluginHookService (T011-14) — Spec 011 Phase 3.

/**
 * Result returned by runBeforeCreateHooks().
 * If approved is false, reason and pluginId identify the rejecting plugin.
 */
export interface HookResult {
  approved: boolean;
  reason?: string;
  pluginId?: string;
}

/**
 * JSON body returned by a plugin's hook handler endpoint.
 * For before_create hooks: plugins can set approve=false to block creation.
 * For created/deleted hooks: response is ignored (fire-and-forget).
 */
export interface HookResponse {
  approve?: boolean;
  reason?: string;
}

/**
 * Payload sent to a plugin's workspace.before_create hook endpoint.
 */
export interface BeforeCreatePayload {
  slug: string;
  name: string;
  parentId?: string;
  templateId?: string;
  tenantId: string;
}

/**
 * Internal representation of a plugin that has subscribed to a hook.
 * Assembled by getHookSubscribers() from DB plugin + tenant_plugin rows.
 */
export interface PluginInfo {
  id: string;
  /** Base URL for the plugin service (used to validate hook URLs) */
  apiBasePath: string;
  /** Workspace hooks declared in the plugin manifest */
  hooks?: {
    workspace?: {
      before_create?: string;
      created?: string;
      deleted?: string;
    };
  };
}
