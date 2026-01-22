import type { EventBusService } from './event-bus.service';
import type { EventHandlerFn, SubscriptionOptions, PublishOptions } from '../types';

/**
 * Plugin Event Client
 *
 * Simplified event interface for plugins, with automatic context injection
 */
export class PluginEventClient {
  private subscriptions: Map<string, string> = new Map(); // User-friendly ID -> actual subscription ID

  constructor(
    private eventBus: EventBusService,
    private pluginId: string,
    private tenantId: string,
    private workspaceId?: string,
    private userId?: string
  ) {}

  /**
   * Publish an event with plugin context automatically injected
   */
  async publish<T = unknown>(
    eventName: string,
    data: T,
    options: {
      workspaceId?: string;
      correlationId?: string;
      causationId?: string;
    } = {}
  ): Promise<void> {
    // Build full topic name for plugin events
    const topic = this.eventBus['topicManager'].buildPluginTopicName(this.pluginId, eventName);

    // Ensure topic exists
    await this.eventBus['topicManager'].createPluginTopic(this.pluginId, eventName);

    // Publish with injected context
    await this.eventBus.publish(topic, data, {
      tenantId: this.tenantId,
      workspaceId: options.workspaceId || this.workspaceId,
      source: this.pluginId,
      userId: this.userId,
      correlationId: options.correlationId,
      causationId: options.causationId,
    });
  }

  /**
   * Subscribe to events (plugin or core)
   */
  async subscribe(
    eventName: string,
    handler: (event: any) => Promise<void>,
    options: {
      workspaceId?: string;
      fromBeginning?: boolean;
      pluginId?: string; // Subscribe to another plugin's events
      coreEvent?: boolean; // Subscribe to core events
    } = {}
  ): Promise<string> {
    // Build topic name
    let topic: string;
    if (options.coreEvent) {
      // Core event subscription (e.g., "core.tenant.created")
      topic = eventName;
    } else if (options.pluginId) {
      // Subscribe to another plugin's events
      topic = this.eventBus['topicManager'].buildPluginTopicName(options.pluginId, eventName);
    } else {
      // Subscribe to own plugin's events
      topic = this.eventBus['topicManager'].buildPluginTopicName(this.pluginId, eventName);
    }

    // Build subscription options with filtering
    const subscriptionOptions: SubscriptionOptions = {
      groupId: `plugin-${this.pluginId}-${eventName}`,
      fromBeginning: options.fromBeginning || false,
      tenantId: this.tenantId,
      workspaceId: options.workspaceId || this.workspaceId,
      autoCommit: true,
    };

    // Subscribe
    const subscriptionId = await this.eventBus.subscribe(
      topic,
      handler as EventHandlerFn,
      subscriptionOptions
    );

    // Store friendly subscription ID
    const friendlyId = `${eventName}-${Date.now()}`;
    this.subscriptions.set(friendlyId, subscriptionId);

    return friendlyId;
  }

  /**
   * Unsubscribe from events
   */
  async unsubscribe(subscriptionId: string): Promise<void> {
    const actualId = this.subscriptions.get(subscriptionId);
    if (!actualId) {
      throw new Error(`Subscription not found: ${subscriptionId}`);
    }

    await this.eventBus.unsubscribe(actualId);
    this.subscriptions.delete(subscriptionId);
  }

  /**
   * Unsubscribe all subscriptions for this plugin
   */
  async unsubscribeAll(): Promise<void> {
    const promises = Array.from(this.subscriptions.keys()).map((id) => this.unsubscribe(id));
    await Promise.all(promises);
  }

  /**
   * Get active subscription count
   */
  getSubscriptionCount(): number {
    return this.subscriptions.size;
  }
}
