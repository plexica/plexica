// File: packages/sdk/src/event-client.ts

/**
 * @plexica/sdk — Event Client
 *
 * Thin wrapper around `PluginEventClient` from `@plexica/event-bus`.
 * Provides a nicer construction pattern from SDK config and delegates
 * all actual event operations to the underlying client.
 */

import type { EventBusService } from '@plexica/event-bus';
import { PluginEventClient } from '@plexica/event-bus';
import type {
  PluginContext,
  PublishEventOptions,
  SubscribeEventOptions,
  EventHandler,
} from './types.js';

/**
 * Configuration for creating an EventClient.
 */
export interface EventClientConfig {
  /** An existing EventBusService instance to delegate to */
  eventBus: EventBusService;
  /** Plugin context for automatic identity injection */
  context: PluginContext;
}

/**
 * SDK-level event client that wraps `PluginEventClient`.
 *
 * Provides typed `publish` / `subscribe` / `unsubscribe` methods
 * with automatic plugin context injection.
 */
export class EventClient {
  private readonly client: PluginEventClient;

  constructor(config: EventClientConfig) {
    this.client = new PluginEventClient(
      config.eventBus,
      config.context.pluginId,
      config.context.tenantId,
      config.context.workspaceId,
      config.context.userId
    );
  }

  /**
   * Create an EventClient directly from a PluginEventClient instance.
   * Useful when you already have a configured client.
   */
  static fromClient(client: PluginEventClient): EventClient {
    const instance = Object.create(EventClient.prototype) as EventClient;
    (instance as unknown as { client: PluginEventClient }).client = client;
    return instance;
  }

  /**
   * Publish a typed event. Plugin context (pluginId, tenantId) is injected automatically.
   */
  async publish<T = unknown>(
    eventName: string,
    data: T,
    options?: PublishEventOptions
  ): Promise<void> {
    await this.client.publish(eventName, data, {
      workspaceId: options?.workspaceId,
      correlationId: options?.correlationId,
      causationId: options?.causationId,
    });
  }

  /**
   * Subscribe to events by name. Returns a subscription ID for later unsubscription.
   */
  async subscribe<T = unknown>(
    eventName: string,
    handler: EventHandler<T>,
    options?: SubscribeEventOptions
  ): Promise<string> {
    return this.client.subscribe(eventName, handler as EventHandler, {
      workspaceId: options?.workspaceId,
      fromBeginning: options?.fromBeginning,
      pluginId: options?.pluginId,
      coreEvent: options?.coreEvent,
    });
  }

  /**
   * Unsubscribe from a specific subscription.
   */
  async unsubscribe(subscriptionId: string): Promise<void> {
    await this.client.unsubscribe(subscriptionId);
  }

  /**
   * Unsubscribe from all active subscriptions.
   */
  async unsubscribeAll(): Promise<void> {
    await this.client.unsubscribeAll();
  }

  /**
   * Get the number of active subscriptions.
   */
  getSubscriptionCount(): number {
    return this.client.getSubscriptionCount();
  }

  /**
   * Get the underlying PluginEventClient for advanced usage.
   */
  getUnderlyingClient(): PluginEventClient {
    return this.client;
  }
}
