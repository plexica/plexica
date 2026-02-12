// File: packages/sdk/src/plugin-base.ts

/**
 * @plexica/sdk — Plugin Base Classes
 *
 * Abstract base classes that every Plexica plugin can extend.
 * Orchestrates the ApiClient, EventClient, ServiceClient, and SharedDataClient.
 */

import type { EventBusService } from '@plexica/event-bus';
import { ApiClient } from './api-client.js';
import type { ApiClientConfig } from './api-client.js';
import { EventClient } from './event-client.js';
import { ServiceClient } from './service-client.js';
import { SharedDataClient } from './shared-data.js';
import type { PluginConfig, PluginContext, ServiceDefinition } from './types.js';

/**
 * Abstract base class for Plexica plugins.
 *
 * Provides pre-configured clients for API calls, events, service registration,
 * and shared data. Subclasses implement lifecycle hooks and define services.
 *
 * @example
 * ```typescript
 * class MyCrmPlugin extends PlexicaPlugin {
 *   getServiceDefinitions() {
 *     return [{
 *       name: 'crm.contacts',
 *       version: '1.0.0',
 *       baseUrl: 'http://localhost:4100',
 *       endpoints: [{ method: 'GET', path: '/contacts' }],
 *     }];
 *   }
 *
 *   async onActivate(context: PluginContext) {
 *     await this.events.subscribe('core.tenant.created', async (event) => {
 *       console.log('New tenant:', event.data);
 *     }, { coreEvent: true });
 *   }
 * }
 * ```
 */
export abstract class PlexicaPlugin {
  /** Typed HTTP client for Core API / Gateway requests */
  readonly api: ApiClient;

  /** Event publish/subscribe client */
  readonly events: EventClient | null;

  /** Service registration and discovery client */
  readonly services: ServiceClient;

  /** Cross-plugin shared data store */
  readonly sharedData: SharedDataClient;

  /** Plugin configuration */
  readonly config: PluginConfig;

  /** Current runtime context */
  protected context: PluginContext;

  /** Track whether the plugin has been started */
  private started = false;

  /** Registered service names (for cleanup on stop) */
  private registeredServiceNames: string[] = [];

  constructor(config: PluginConfig, eventBus?: EventBusService) {
    this.config = config;

    // Build the initial context (tenantId will be set per-request in multi-tenant scenarios)
    this.context = {
      pluginId: config.pluginId,
      tenantId: '', // Set during start() or per-request
    };

    // Create API client
    const apiConfig: ApiClientConfig = {
      baseUrl: config.apiBaseUrl,
      context: this.context,
    };
    this.api = new ApiClient(apiConfig);

    // Create service client
    this.services = new ServiceClient(this.api, this.context);

    // Create shared data client
    this.sharedData = new SharedDataClient(this.api, this.context);

    // Create event client (optional — requires EventBusService)
    if (eventBus) {
      this.events = new EventClient({
        eventBus,
        context: this.context,
      });
    } else {
      this.events = null;
    }
  }

  // -----------------------------------------------------------------------
  // Abstract methods — subclasses must implement
  // -----------------------------------------------------------------------

  /**
   * Return the services this plugin exposes.
   * Called during `start()` to register with the gateway.
   */
  abstract getServiceDefinitions(): ServiceDefinition[];

  // -----------------------------------------------------------------------
  // Lifecycle hooks — subclasses can override
  // -----------------------------------------------------------------------

  /**
   * Called when the plugin is installed for a tenant.
   * Override to run one-time setup (e.g., create database tables).
   */
  async onInstall(_context: PluginContext): Promise<void> {
    // Default: no-op
  }

  /**
   * Called when the plugin is activated.
   * Override to start background work, subscribe to events, etc.
   */
  async onActivate(_context: PluginContext): Promise<void> {
    // Default: no-op
  }

  /**
   * Called when the plugin is deactivated.
   * Override to pause background work.
   */
  async onDeactivate(_context: PluginContext): Promise<void> {
    // Default: no-op
  }

  /**
   * Called when the plugin is uninstalled.
   * Override to clean up resources.
   */
  async onUninstall(_context: PluginContext): Promise<void> {
    // Default: no-op
  }

  // -----------------------------------------------------------------------
  // Lifecycle management
  // -----------------------------------------------------------------------

  /**
   * Start the plugin: register services and call the `onActivate` hook.
   *
   * @param tenantId  The tenant this plugin instance is operating in.
   * @param userId    Optional authenticated user ID.
   */
  async start(tenantId: string, userId?: string): Promise<void> {
    if (this.started) {
      throw new Error(`Plugin "${this.config.pluginId}" is already started`);
    }

    // Update context with runtime values
    this.context.tenantId = tenantId;
    if (userId) {
      this.context.userId = userId;
    }

    // Register services with the gateway
    const services = this.getServiceDefinitions();
    if (services.length > 0) {
      const result = await this.services.registerServices(services);
      if (!result.success) {
        throw new Error(`Failed to register services: ${result.message ?? result.error}`);
      }
      this.registeredServiceNames = services.map((s) => s.name);
    }

    // Call lifecycle hook
    await this.onActivate(this.context);

    this.started = true;
  }

  /**
   * Stop the plugin: unsubscribe events, deregister services, and call `onDeactivate`.
   */
  async stop(): Promise<void> {
    if (!this.started) {
      return; // Already stopped — idempotent
    }

    // Call lifecycle hook first (while clients are still available)
    await this.onDeactivate(this.context);

    // Unsubscribe all events
    if (this.events) {
      await this.events.unsubscribeAll();
    }

    // Deregister services
    if (this.registeredServiceNames.length > 0) {
      await this.services.deregisterAllServices(this.registeredServiceNames);
      this.registeredServiceNames = [];
    }

    this.started = false;
  }

  /**
   * Whether the plugin is currently running.
   */
  isStarted(): boolean {
    return this.started;
  }

  /**
   * Get the current plugin context.
   */
  getContext(): PluginContext {
    return { ...this.context };
  }
}

/**
 * Plugin subclass for workspace-scoped plugins.
 *
 * Automatically includes `workspaceId` in the context, filtering
 * all data operations by workspace.
 */
export abstract class WorkspaceAwarePlugin extends PlexicaPlugin {
  /**
   * The workspace ID this plugin instance is bound to.
   */
  get workspaceId(): string | undefined {
    return this.context.workspaceId;
  }

  /**
   * Start the plugin with a workspace context.
   */
  async start(tenantId: string, userId?: string, workspaceId?: string): Promise<void> {
    if (workspaceId) {
      this.context.workspaceId = workspaceId;
    }
    await super.start(tenantId, userId);
  }

  /**
   * Update the workspace context at runtime.
   * Useful when a plugin serves multiple workspaces.
   */
  setWorkspaceId(workspaceId: string): void {
    this.context.workspaceId = workspaceId;
  }
}
