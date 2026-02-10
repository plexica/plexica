// File: packages/types/src/event.ts

/**
 * Base domain event interface.
 * All events flowing through the event bus conform to this shape.
 *
 * NOTE: The full event-bus infrastructure types (EventBusConfig, SubscriptionOptions,
 * TopicConfig, etc.) remain in `@plexica/event-bus` since they are implementation
 * details of the bus itself. Only the domain-level types are shared here.
 */
export interface DomainEvent<T = unknown> {
  /** UUID */
  id: string;
  /** Event type (e.g. "core.tenant.created", "plugin.crm.contact.created") */
  type: string;
  tenantId: string;
  workspaceId?: string;
  timestamp: Date;
  data: T;
  metadata: EventMetadata;
}

/**
 * Metadata attached to every domain event.
 */
export interface EventMetadata {
  /** Plugin ID or 'core' */
  source: string;
  userId?: string;
  /** For tracing related events */
  correlationId?: string;
  /** The event that caused this event */
  causationId?: string;
  /** Schema version */
  version?: string;
}

/**
 * Event handler function type.
 */
export type EventHandlerFn<T = unknown> = (event: DomainEvent<T>) => Promise<void>;
