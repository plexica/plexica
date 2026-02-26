// File: packages/sdk/src/decorators/events.ts

/**
 * @plexica/sdk — Event Decorators
 *
 * TypeScript decorators for declaratively wiring event handlers and publishers
 * into Plexica plugin classes. Metadata is stored via `reflect-metadata` and
 * read at runtime by the plugin loader.
 *
 * Topic naming convention: `plugin.<pluginId>.<eventName>`
 * This is consistent with the TopicManager.buildPluginTopicName() convention
 * used by the core API's PluginLifecycleService.
 */

import 'reflect-metadata';

/** Metadata key for event handler topics (method decorator) */
export const METADATA_KEY_EVENT_HANDLER = 'plexica:event-handler';

/** Metadata key for event publisher marker (class decorator) */
export const METADATA_KEY_EVENT_PUBLISHER = 'plexica:event-publisher';

/**
 * Method decorator that marks a class method as an event handler for the
 * given topic.
 *
 * The topic should follow the convention `plugin.<pluginId>.<eventName>`,
 * e.g. `plugin.crm.contact-created`.
 *
 * @example
 * ```typescript
 * class MyCrmPlugin extends PlexicaPlugin {
 *   @EventHandler('plugin.crm.contact-created')
 *   async onContactCreated(event: DomainEvent) {
 *     console.log('Contact created:', event.data);
 *   }
 * }
 * ```
 */
export function EventHandler(topic: string): MethodDecorator {
  return function (
    target: object,
    propertyKey: string | symbol,
    _descriptor: PropertyDescriptor
  ): void {
    Reflect.defineMetadata(METADATA_KEY_EVENT_HANDLER, topic, target, propertyKey);
  };
}

/**
 * Class decorator that marks a plugin class as an event publisher.
 *
 * Signals to the plugin loader that this class will publish events and
 * should have its event client configured automatically.
 *
 * @example
 * ```typescript
 * @EventPublisher()
 * class MyAnalyticsPlugin extends PlexicaPlugin {
 *   async reportMetric(data: MetricData) {
 *     await this.events?.publish('plugin.analytics.metric-recorded', data);
 *   }
 * }
 * ```
 */
export function EventPublisher(): ClassDecorator {
  return function (target: Function): void {
    Reflect.defineMetadata(METADATA_KEY_EVENT_PUBLISHER, true, target);
  };
}
