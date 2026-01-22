import { EventBusService } from '../services/event-bus.service';
import type { PluginEventClient } from '../services/plugin-event-client';
import { getEventHandlers, getEventPublishers } from '../decorators/event-handler.decorator';

/**
 * Event handler registry
 * Tracks active subscriptions for cleanup
 */
class EventHandlerRegistry {
  private subscriptions = new Map<any, string[]>();

  /**
   * Register a subscription for an instance
   */
  registerSubscription(instance: any, subscriptionId: string): void {
    if (!this.subscriptions.has(instance)) {
      this.subscriptions.set(instance, []);
    }
    this.subscriptions.get(instance)!.push(subscriptionId);
  }

  /**
   * Get all subscriptions for an instance
   */
  getSubscriptions(instance: any): string[] {
    return this.subscriptions.get(instance) || [];
  }

  /**
   * Clear subscriptions for an instance
   */
  clearSubscriptions(instance: any): void {
    this.subscriptions.delete(instance);
  }
}

const registry = new EventHandlerRegistry();

/**
 * Initialize event handlers for a class instance
 *
 * Scans the instance for @EventHandler decorated methods and automatically
 * subscribes them to the EventBus or PluginEventClient.
 *
 * @param instance The class instance to initialize
 * @param eventClient EventBusService or PluginEventClient instance
 * @returns Promise that resolves when all handlers are subscribed
 *
 * @example
 * ```typescript
 * class MyService {
 *   @EventHandler({ eventName: 'core.user.created' })
 *   async onUserCreated(event: DomainEvent) {
 *     // Handle event
 *   }
 * }
 *
 * const service = new MyService();
 * await initializeEventHandlers(service, eventBus);
 * ```
 */
export async function initializeEventHandlers(
  instance: any,
  eventClient: EventBusService | PluginEventClient
): Promise<void> {
  const handlers = getEventHandlers(instance.constructor);

  for (const handler of handlers) {
    const method = instance[handler.methodName];
    if (typeof method !== 'function') {
      console.warn(`⚠️  Event handler ${String(handler.methodName)} is not a function`);
      continue;
    }

    // Bind method to instance
    const boundMethod = method.bind(instance);

    // Subscribe to event
    const subscriptionId = await eventClient.subscribe(handler.options.eventName, boundMethod, {
      groupId: handler.options.groupId,
      fromBeginning: handler.options.fromBeginning,
      tenantId: handler.options.tenantId,
      workspaceId: handler.options.workspaceId,
    });

    // Track subscription for cleanup
    registry.registerSubscription(instance, subscriptionId);

    console.log(
      `✅ Event handler registered: ${String(handler.methodName)} -> ${handler.options.eventName}`
    );
  }
}

/**
 * Cleanup event handlers for a class instance
 *
 * Unsubscribes all event handlers that were registered via decorators.
 *
 * @param instance The class instance to cleanup
 * @param eventClient EventBusService or PluginEventClient instance
 *
 * @example
 * ```typescript
 * await cleanupEventHandlers(service, eventBus);
 * ```
 */
export async function cleanupEventHandlers(
  instance: any,
  eventClient: EventBusService | PluginEventClient
): Promise<void> {
  const subscriptions = registry.getSubscriptions(instance);

  for (const subscriptionId of subscriptions) {
    await eventClient.unsubscribe(subscriptionId);
  }

  registry.clearSubscriptions(instance);
  console.log(`✅ Cleaned up ${subscriptions.length} event handlers`);
}

/**
 * Wrap a class instance to automatically publish events
 *
 * Wraps methods decorated with @EventPublisher to automatically publish
 * events when the method is called.
 *
 * @param instance The class instance to wrap
 * @param eventClient EventBusService or PluginEventClient instance
 * @returns The wrapped instance with event publishing
 *
 * @example
 * ```typescript
 * class MyService {
 *   @EventPublisher({ eventName: 'plugin.crm.contact.created' })
 *   async createContact(data: ContactData) {
 *     // Business logic
 *     return data;
 *   }
 * }
 *
 * const service = wrapEventPublishers(new MyService(), pluginEventClient);
 * await service.createContact({ name: 'John' }); // Auto-publishes event
 * ```
 */
export function wrapEventPublishers<T extends object>(
  instance: T,
  eventClient: EventBusService | PluginEventClient
): T {
  const publishers = getEventPublishers(instance.constructor);

  for (const publisher of publishers) {
    const originalMethod = (instance as any)[publisher.methodName];
    if (typeof originalMethod !== 'function') {
      console.warn(`⚠️  Event publisher ${String(publisher.methodName)} is not a function`);
      continue;
    }

    // Wrap the method to publish event after execution
    (instance as any)[publisher.methodName] = async function (...args: any[]) {
      // Execute original method
      const result = await originalMethod.apply(instance, args);

      // Publish event with the result as data
      try {
        if ('publish' in eventClient) {
          // Call publish - works for both EventBusService and PluginEventClient
          // EventBusService accepts: (eventType, data, metadata, options)
          // PluginEventClient accepts: (eventName, data, options)
          if (eventClient instanceof EventBusService) {
            await (eventClient as any).publish(
              publisher.options.eventName,
              result,
              {}, // metadata
              publisher.options.compress ? { compress: true } : {}
            );
          } else {
            // PluginEventClient
            await eventClient.publish(publisher.options.eventName, result, {});
          }

          console.log(`📤 Event published: ${publisher.options.eventName}`);
        }
      } catch (error) {
        console.error(`❌ Failed to publish event ${publisher.options.eventName}:`, error);
        // Don't throw - allow original method to complete successfully
      }

      return result;
    };
  }

  return instance;
}
