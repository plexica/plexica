// @ts-nocheck
import { v4 as uuidv4 } from 'uuid';
import type { Producer, Consumer, EachMessagePayload, CompressionTypes } from 'kafkajs';
import type {
  DomainEvent,
  EventHandlerFn,
  SubscriptionOptions,
  PublishOptions,
  EventFilter,
  EventMetadata,
} from '../types';
import { DomainEventSchema } from '../types';
import { RedpandaClient } from './redpanda-client';
import { TopicManager } from './topic-manager';
import { DeadLetterQueueService } from './dead-letter-queue.service';
import { eventMetrics } from '../metrics/event-metrics';

/**
 * Circuit breaker states for error handling
 */
enum CircuitState {
  CLOSED = 'CLOSED', // Normal operation
  OPEN = 'OPEN', // Failing, reject requests
  HALF_OPEN = 'HALF_OPEN', // Testing if service recovered
}

/**
 * Circuit breaker configuration
 */
interface CircuitBreakerConfig {
  failureThreshold: number; // Number of failures before opening
  successThreshold: number; // Number of successes to close from half-open
  timeout: number; // Time to wait before trying again (ms)
}

/**
 * Subscription metadata
 */
interface SubscriptionMetadata {
  topic: string;
  groupId: string;
  handler: EventHandlerFn;
  filter?: EventFilter;
  consumer: Consumer;
}

/**
 * Batch publishing configuration
 */
interface BatchConfig {
  maxBatchSize: number; // Max events per batch
  maxBatchWaitTime: number; // Max time to wait before sending batch (ms)
}

/**
 * EventBus Service - Central event publishing and subscription service
 *
 * Features:
 * - Publish/subscribe with tenant context propagation
 * - Batch publishing for high throughput
 * - Event filtering (tenant, workspace, custom predicates)
 * - Circuit breaker pattern for fault tolerance
 * - Dead letter queue routing for failed events
 * - Prometheus metrics hooks
 */
export class EventBusService {
  private producer: Producer;
  private topicManager: TopicManager;
  private dlqService: DeadLetterQueueService;
  private subscriptions: Map<string, SubscriptionMetadata> = new Map();
  private circuitBreaker: Map<
    string,
    {
      state: CircuitState;
      failures: number;
      successes: number;
      nextAttempt: number;
    }
  > = new Map();
  private circuitBreakerConfig: CircuitBreakerConfig = {
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 60000, // 1 minute
  };
  private batchConfig: BatchConfig = {
    maxBatchSize: 100,
    maxBatchWaitTime: 100, // 100ms
  };
  private pendingBatch: Array<{
    topic: string;
    messages: any[];
  }> = [];
  private batchTimer: NodeJS.Timeout | null = null;
  private isShuttingDown = false;

  constructor(private client: RedpandaClient) {
    this.producer = client.getProducer();
    this.topicManager = new TopicManager(client);
    this.dlqService = new DeadLetterQueueService(client);
  }

  /**
   * Publish a single event
   */
  async publish<T = unknown>(
    eventType: string,
    data: T,
    metadata: Partial<EventMetadata> & { tenantId?: string; workspaceId?: string } = {},
    options: PublishOptions = {}
  ): Promise<void> {
    if (this.isShuttingDown) {
      throw new Error('EventBus is shutting down');
    }

    const startTime = Date.now();

    try {
      // Build domain event
      const event = this.buildDomainEvent(eventType, data, metadata);

      // Validate event
      DomainEventSchema.parse(event);

      // Determine topic from event type
      const topic = eventType; // Event type IS the topic name

      // Check circuit breaker
      this.checkCircuitBreaker(topic);

      // Serialize event
      const serializedEvent = this.serializeEvent(event);

      // Prepare message
      const message = {
        key: options.partitionKey || event.tenantId, // Partition by tenant for ordering
        value: serializedEvent,
        headers: {
          'event-id': event.id,
          'event-type': event.type,
          'tenant-id': event.tenantId,
          'workspace-id': event.workspaceId || '',
          'correlation-id': event.metadata.correlationId || '',
          timestamp: event.timestamp.toISOString(),
          ...(options.headers || {}),
        },
      };
      // Set compression (KafkaJS uses numeric compression types)
      const compression = options.compress ? 2 : 0; // 0=None, 1=GZIP, 2=Snappy, 3=LZ4, 4=ZSTD
      // Send to Redpanda
      await this.producer.send({
        topic,
        messages: [message],
        compression: compression as CompressionTypes,
      });

      // Record success
      this.recordCircuitSuccess(topic);

      // Record metrics
      const duration = Date.now() - startTime;
      eventMetrics.recordEventPublished(
        topic,
        eventType,
        event.tenantId,
        event.metadata.source || 'unknown'
      );
      eventMetrics.recordEventPublishDuration(topic, eventType, duration);

      console.log(`✅ Event published: ${event.type} [${event.id}] (${duration}ms)`);
    } catch (error) {
      // Record failure
      this.recordCircuitFailure(eventType);

      // Record failure metrics
      const errorType = error instanceof Error ? error.constructor.name : 'UnknownError';
      eventMetrics.recordEventFailed(
        eventType,
        eventType,
        metadata?.tenantId || 'unknown',
        errorType
      );

      console.error(`❌ Failed to publish event ${eventType}:`, error);
      throw error;
    }
  }

  /**
   * Publish multiple events in a batch
   */
  async publishBatch<T = unknown>(
    events: Array<{
      eventType: string;
      data: T;
      metadata?: Partial<EventMetadata> & { tenantId?: string; workspaceId?: string };
      options?: PublishOptions;
    }>
  ): Promise<void> {
    if (this.isShuttingDown) {
      throw new Error('EventBus is shutting down');
    }

    try {
      // Group events by topic
      const eventsByTopic = new Map<string, any[]>();

      for (const { eventType, data, metadata = {}, options = {} } of events) {
        const event = this.buildDomainEvent(eventType, data, metadata);
        DomainEventSchema.parse(event);

        const topic = eventType;
        const serializedEvent = this.serializeEvent(event);

        const message = {
          key: options.partitionKey || event.tenantId,
          value: serializedEvent,
          headers: {
            'event-id': event.id,
            'event-type': event.type,
            'tenant-id': event.tenantId,
            'workspace-id': event.workspaceId || '',
            'correlation-id': event.metadata.correlationId || '',
            timestamp: event.timestamp.toISOString(),
            ...(options.headers || {}),
          },
        };

        if (!eventsByTopic.has(topic)) {
          eventsByTopic.set(topic, []);
        }
        eventsByTopic.get(topic)!.push(message);
      }

      // Send batches
      const sendPromises = Array.from(eventsByTopic.entries()).map(([topic, messages]) => {
        this.checkCircuitBreaker(topic);

        return this.producer.send({
          topic,
          messages,
          compression: 2 as CompressionTypes, // 2 = Snappy
        });
      });

      await Promise.all(sendPromises);

      // Record successes
      eventsByTopic.forEach((_, topic) => {
        this.recordCircuitSuccess(topic);
      });

      console.log(`✅ Batch published: ${events.length} events`);
    } catch (error) {
      console.error(`❌ Failed to publish batch:`, error);
      throw error;
    }
  }

  /**
   * Subscribe to events with filtering
   */
  async subscribe(
    eventType: string,
    handler: EventHandlerFn,
    options: SubscriptionOptions = {}
  ): Promise<string> {
    const topic = eventType;
    const groupId = options.groupId || `plexica-${eventType}-${uuidv4()}`;
    const subscriptionId = `${topic}:${groupId}`;

    if (this.subscriptions.has(subscriptionId)) {
      throw new Error(`Subscription already exists: ${subscriptionId}`);
    }

    try {
      // Get or create consumer
      const consumer = await this.client.getConsumer(groupId);

      // Subscribe to topic
      await consumer.subscribe({
        topic,
        fromBeginning: options.fromBeginning || false,
      });

      // Build event filter
      const filter = this.buildEventFilter(options);

      // Store subscription metadata
      const subscription: SubscriptionMetadata = {
        topic,
        groupId,
        handler,
        filter,
        consumer,
      };

      this.subscriptions.set(subscriptionId, subscription);

      // Record subscription metric
      eventMetrics.incrementSubscriptions(topic, groupId);

      // Start consuming
      await consumer.run({
        autoCommit: options.autoCommit !== false, // Default: true
        eachMessage: async (payload: EachMessagePayload) => {
          await this.handleMessage(subscriptionId, payload);
        },
      });

      console.log(`✅ Subscribed to ${topic} with group ${groupId}`);
      return subscriptionId;
    } catch (error) {
      console.error(`❌ Failed to subscribe to ${topic}:`, error);
      throw error;
    }
  }

  /**
   * Unsubscribe from events
   */
  async unsubscribe(subscriptionId: string): Promise<void> {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      console.warn(`⚠️  Subscription not found: ${subscriptionId}`);
      return;
    }

    try {
      // Stop consumer
      await subscription.consumer.stop();
      await subscription.consumer.disconnect();

      // Remove subscription
      this.subscriptions.delete(subscriptionId);

      // Record unsubscribe metric
      eventMetrics.decrementSubscriptions(subscription.topic, subscription.groupId);

      console.log(`✅ Unsubscribed: ${subscriptionId}`);
    } catch (error) {
      console.error(`❌ Failed to unsubscribe ${subscriptionId}:`, error);
      throw error;
    }
  }

  /**
   * Unsubscribe all subscriptions
   */
  async unsubscribeAll(): Promise<void> {
    const subscriptionIds = Array.from(this.subscriptions.keys());
    await Promise.all(subscriptionIds.map((id) => this.unsubscribe(id)));
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    console.log('🛑 EventBus shutting down...');
    this.isShuttingDown = true;

    // Stop batch timer
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    // Flush pending batch
    if (this.pendingBatch.length > 0) {
      await this.flushBatch();
    }

    // Unsubscribe all
    await this.unsubscribeAll();

    console.log('✅ EventBus shutdown complete');
  }

  /**
   * Get subscription count
   */
  getSubscriptionCount(): number {
    return this.subscriptions.size;
  }

  /**
   * Get active subscriptions
   */
  getActiveSubscriptions(): string[] {
    return Array.from(this.subscriptions.keys());
  }

  /**
   * Get Dead Letter Queue service
   */
  getDLQService(): DeadLetterQueueService {
    return this.dlqService;
  }

  /**
   * Handle incoming message
   */
  private async handleMessage(subscriptionId: string, payload: EachMessagePayload): Promise<void> {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      console.warn(`⚠️  Subscription not found: ${subscriptionId}`);
      return;
    }

    let event: DomainEvent | null = null;
    const startTime = Date.now();

    try {
      // Deserialize event
      event = this.deserializeEvent(payload.message.value);

      // Apply filter
      if (subscription.filter && !subscription.filter(event)) {
        // Event filtered out, skip
        return;
      }

      // Execute handler
      await subscription.handler(event);

      // Record consumption metrics
      const duration = Date.now() - startTime;
      eventMetrics.recordEventConsumed(
        subscription.topic,
        event.type,
        event.tenantId,
        subscription.groupId
      );
      eventMetrics.recordEventConsumeDuration(
        subscription.topic,
        event.type,
        subscription.groupId,
        duration
      );
    } catch (error) {
      console.error(`❌ Error handling event in ${subscriptionId}:`, error);

      // Record failure metrics
      if (event) {
        const errorType = error instanceof Error ? error.constructor.name : 'UnknownError';
        eventMetrics.recordEventFailed(subscription.topic, event.type, event.tenantId, errorType);
      }

      // Route to Dead Letter Queue
      if (event) {
        await this.dlqService.routeToDLQ(event, subscription.topic, error as Error, {
          consumerGroup: subscription.groupId,
          partition: payload.partition,
          offset: payload.message.offset,
        });
      }

      // Don't rethrow - event is in DLQ and will be retried
      // throw error; // Commented out to prevent consumer crash
    }
  }

  /**
   * Build domain event from data
   */
  private buildDomainEvent<T>(
    eventType: string,
    data: T,
    metadata: Partial<EventMetadata> & { tenantId?: string; workspaceId?: string }
  ): DomainEvent<T> {
    // TODO: Get tenant context from AsyncLocalStorage
    // For now, we require tenantId in metadata
    if (!metadata.tenantId) {
      throw new Error('tenantId is required in metadata (will be auto-populated from context)');
    }

    return {
      id: uuidv4(),
      type: eventType,
      tenantId: metadata.tenantId,
      workspaceId: metadata.workspaceId,
      timestamp: new Date(),
      data,
      metadata: {
        source: metadata.source || 'core',
        userId: metadata.userId,
        correlationId: metadata.correlationId || uuidv4(),
        causationId: metadata.causationId,
        version: metadata.version || '1.0',
      },
    };
  }

  /**
   * Build event filter from subscription options
   */
  private buildEventFilter(options: SubscriptionOptions): EventFilter | undefined {
    const filters: EventFilter[] = [];

    // Tenant filter
    if (options.tenantId) {
      filters.push((event) => event.tenantId === options.tenantId);
    }

    // Workspace filter
    if (options.workspaceId) {
      filters.push((event) => event.workspaceId === options.workspaceId);
    }

    // Combine filters with AND logic
    if (filters.length === 0) {
      return undefined;
    }

    return (event: DomainEvent) => {
      return filters.every((filter) => filter(event));
    };
  }

  /**
   * Serialize event to Buffer
   */
  private serializeEvent(event: DomainEvent): Buffer {
    // Convert Date to ISO string for JSON serialization
    const serializable = {
      ...event,
      timestamp: event.timestamp.toISOString(),
    };

    return Buffer.from(JSON.stringify(serializable), 'utf-8');
  }

  /**
   * Deserialize event from Buffer
   */
  private deserializeEvent(buffer: Buffer | null): DomainEvent {
    if (!buffer) {
      throw new Error('Cannot deserialize null buffer');
    }

    const json = JSON.parse(buffer.toString('utf-8'));

    // Convert ISO string back to Date
    return {
      ...json,
      timestamp: new Date(json.timestamp),
    };
  }

  /**
   * Check circuit breaker state
   */
  private checkCircuitBreaker(topic: string): void {
    const breaker = this.circuitBreaker.get(topic);
    if (!breaker) {
      return; // No breaker, allow request
    }

    if (breaker.state === CircuitState.OPEN) {
      if (Date.now() < breaker.nextAttempt) {
        throw new Error(`Circuit breaker OPEN for topic: ${topic}`);
      }

      // Transition to half-open
      breaker.state = CircuitState.HALF_OPEN;
      breaker.successes = 0;
      console.log(`🔄 Circuit breaker HALF_OPEN for topic: ${topic}`);
    }
  }

  /**
   * Record circuit breaker success
   */
  private recordCircuitSuccess(topic: string): void {
    let breaker = this.circuitBreaker.get(topic);
    if (!breaker) {
      return;
    }

    if (breaker.state === CircuitState.HALF_OPEN) {
      breaker.successes++;
      if (breaker.successes >= this.circuitBreakerConfig.successThreshold) {
        breaker.state = CircuitState.CLOSED;
        breaker.failures = 0;
        console.log(`✅ Circuit breaker CLOSED for topic: ${topic}`);
      }
    } else if (breaker.state === CircuitState.CLOSED) {
      breaker.failures = Math.max(0, breaker.failures - 1); // Decay failures
    }
  }

  /**
   * Record circuit breaker failure
   */
  private recordCircuitFailure(topic: string): void {
    let breaker = this.circuitBreaker.get(topic);
    if (!breaker) {
      breaker = {
        state: CircuitState.CLOSED,
        failures: 0,
        successes: 0,
        nextAttempt: 0,
      };
      this.circuitBreaker.set(topic, breaker);
    }

    breaker.failures++;

    if (
      breaker.state === CircuitState.CLOSED &&
      breaker.failures >= this.circuitBreakerConfig.failureThreshold
    ) {
      breaker.state = CircuitState.OPEN;
      breaker.nextAttempt = Date.now() + this.circuitBreakerConfig.timeout;
      console.error(`🚨 Circuit breaker OPEN for topic: ${topic}`);
    } else if (breaker.state === CircuitState.HALF_OPEN) {
      breaker.state = CircuitState.OPEN;
      breaker.nextAttempt = Date.now() + this.circuitBreakerConfig.timeout;
      console.error(`🚨 Circuit breaker reopened for topic: ${topic}`);
    }
  }

  /**
   * Flush pending batch (for future batch optimization)
   */
  private async flushBatch(): Promise<void> {
    if (this.pendingBatch.length === 0) {
      return;
    }

    console.log(`📦 Flushing batch: ${this.pendingBatch.length} events`);
    // TODO: Implement batch flushing logic
    this.pendingBatch = [];
  }
}
