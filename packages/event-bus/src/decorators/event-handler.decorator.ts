import 'reflect-metadata';

/**
 * Metadata keys for event decorators
 */
export const EVENT_HANDLER_METADATA = 'event:handler';
export const EVENT_PUBLISHER_METADATA = 'event:publisher';

/**
 * Event handler options
 */
export interface EventHandlerOptions {
  eventName: string;
  groupId?: string;
  fromBeginning?: boolean;
  tenantId?: string;
  workspaceId?: string;
}

/**
 * Event publisher options
 */
export interface EventPublisherOptions {
  eventName: string;
  compress?: boolean;
}

/**
 * @EventHandler Decorator
 *
 * Marks a method as an event handler that should be automatically subscribed
 * to the specified event when the class is instantiated.
 *
 * @example
 * ```typescript
 * class MyService {
 *   @EventHandler({ eventName: 'core.user.created' })
 *   async onUserCreated(event: DomainEvent<UserCreatedData>) {
 *     console.log('User created:', event.data);
 *   }
 * }
 * ```
 */
export function EventHandler(options: EventHandlerOptions): MethodDecorator {
  return (target: Object, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
    // Store metadata about this event handler
    const existingHandlers = Reflect.getMetadata(EVENT_HANDLER_METADATA, target.constructor) || [];

    Reflect.defineMetadata(
      EVENT_HANDLER_METADATA,
      [
        ...existingHandlers,
        {
          methodName: propertyKey,
          options,
        },
      ],
      target.constructor
    );

    return descriptor;
  };
}

/**
 * @EventPublisher Decorator
 *
 * Marks a method as an event publisher. The method will automatically
 * publish events through the EventBus when called.
 *
 * @example
 * ```typescript
 * class MyService {
 *   @EventPublisher({ eventName: 'plugin.crm.contact.created' })
 *   async publishContactCreated(data: ContactCreatedData) {
 *     // Method body is optional - decorator handles publishing
 *     return data;
 *   }
 * }
 * ```
 */
export function EventPublisher(options: EventPublisherOptions): MethodDecorator {
  return (target: Object, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
    // Store metadata about this event publisher
    const existingPublishers =
      Reflect.getMetadata(EVENT_PUBLISHER_METADATA, target.constructor) || [];

    Reflect.defineMetadata(
      EVENT_PUBLISHER_METADATA,
      [
        ...existingPublishers,
        {
          methodName: propertyKey,
          options,
        },
      ],
      target.constructor
    );

    return descriptor;
  };
}

/**
 * Get all event handlers registered on a class
 */
export function getEventHandlers(target: any): Array<{
  methodName: string | symbol;
  options: EventHandlerOptions;
}> {
  return Reflect.getMetadata(EVENT_HANDLER_METADATA, target) || [];
}

/**
 * Get all event publishers registered on a class
 */
export function getEventPublishers(target: any): Array<{
  methodName: string | symbol;
  options: EventPublisherOptions;
}> {
  return Reflect.getMetadata(EVENT_PUBLISHER_METADATA, target) || [];
}
