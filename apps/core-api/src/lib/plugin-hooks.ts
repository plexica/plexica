import type { PluginHookContext, PluginHookHandler } from '../types/plugin.types.js';

/**
 * Plugin Hook/Event System
 *
 * Allows plugins to subscribe to system events and extend functionality
 */

type HookName = string;
type HookHandlerMap = Map<string, PluginHookHandler[]>; // pluginId -> handlers

export class PluginHookSystem {
  private hooks: Map<HookName, HookHandlerMap> = new Map();

  /**
   * Register a hook handler for a plugin
   */
  registerHook(hookName: HookName, pluginId: string, handler: PluginHookHandler): void {
    if (!this.hooks.has(hookName)) {
      this.hooks.set(hookName, new Map());
    }

    const hookMap = this.hooks.get(hookName)!;
    if (!hookMap.has(pluginId)) {
      hookMap.set(pluginId, []);
    }

    hookMap.get(pluginId)!.push(handler);
  }

  /**
   * Unregister all hooks for a plugin
   */
  unregisterPlugin(pluginId: string): void {
    for (const [hookName, hookMap] of this.hooks.entries()) {
      hookMap.delete(pluginId);

      // Clean up empty hook maps
      if (hookMap.size === 0) {
        this.hooks.delete(hookName);
      }
    }
  }

  /**
   * Trigger a hook and execute all registered handlers
   * Handlers are executed sequentially
   */
  async trigger(hookName: HookName, context: PluginHookContext): Promise<unknown[]> {
    const hookMap = this.hooks.get(hookName);
    if (!hookMap) {
      return [];
    }

    const results: unknown[] = [];

    for (const [pluginId, handlers] of hookMap.entries()) {
      for (const handler of handlers) {
        try {
          const result = await handler(context);
          results.push({ pluginId, result });
        } catch (error: unknown) {
          // Log error but don't stop execution
          const errorMsg = error instanceof Error ? error.message : String(error);
          console.error(`Error in plugin ${pluginId} hook ${hookName}:`, error);
          results.push({ pluginId, error: errorMsg });
        }
      }
    }

    return results;
  }

  /**
   * Trigger a hook and allow handlers to modify data
   * Each handler receives the output of the previous handler
   */
  async chain(hookName: HookName, context: PluginHookContext): Promise<unknown> {
    const hookMap = this.hooks.get(hookName);
    if (!hookMap) {
      return context.data;
    }

    let data: unknown = context.data;

    for (const [pluginId, handlers] of hookMap.entries()) {
      for (const handler of handlers) {
        try {
          data = await handler({ ...context, data });
        } catch (error: unknown) {
          console.error(`Error in plugin ${pluginId} hook ${hookName}:`, error);
          // Continue with previous data
        }
      }
    }

    return data;
  }

  /**
   * Check if a hook has any registered handlers
   */
  hasHook(hookName: HookName): boolean {
    return this.hooks.has(hookName) && this.hooks.get(hookName)!.size > 0;
  }

  /**
   * Get all registered hooks
   */
  getRegisteredHooks(): string[] {
    return Array.from(this.hooks.keys());
  }

  /**
   * Get plugins registered for a specific hook
   */
  getPluginsForHook(hookName: HookName): string[] {
    const hookMap = this.hooks.get(hookName);
    if (!hookMap) {
      return [];
    }
    return Array.from(hookMap.keys());
  }
}

// Singleton instance
export const pluginHookSystem = new PluginHookSystem();

/**
 * Standard system hooks
 * These are hooks that the core system provides
 */
export const SystemHooks = {
  // Tenant lifecycle
  TENANT_CREATED: 'tenant.created',
  TENANT_UPDATED: 'tenant.updated',
  TENANT_DELETED: 'tenant.deleted',

  // User lifecycle
  USER_CREATED: 'user.created',
  USER_UPDATED: 'user.updated',
  USER_DELETED: 'user.deleted',
  USER_LOGIN: 'user.login',
  USER_LOGOUT: 'user.logout',

  // Authentication
  AUTH_SUCCESS: 'auth.success',
  AUTH_FAILED: 'auth.failed',

  // API requests
  API_REQUEST: 'api.request',
  API_RESPONSE: 'api.response',
  API_ERROR: 'api.error',

  // Data transformation
  DATA_CREATE: 'data.create',
  DATA_UPDATE: 'data.update',
  DATA_DELETE: 'data.delete',
  DATA_READ: 'data.read',

  // Custom hooks
  CUSTOM: 'custom',
} as const;

/**
 * Hook helper for triggering system events
 */
export async function triggerHook(
  hookName: string,
  tenantId: string,
  data: unknown,
  userId?: string
): Promise<unknown[]> {
  return pluginHookSystem.trigger(hookName, {
    tenantId,
    userId,
    pluginId: '', // Will be set by the system for each plugin
    data,
  });
}

/**
 * Hook helper for chaining transformations
 */
export async function chainHook(
  hookName: string,
  tenantId: string,
  data: unknown,
  userId?: string
): Promise<unknown> {
  return pluginHookSystem.chain(hookName, {
    tenantId,
    userId,
    pluginId: '',
    data,
  });
}
