/**
 * Prometheus Metrics for Event System
 *
 * Provides observability for:
 * - Event publishing (rate, duration, errors)
 * - Event consumption (rate, duration, errors)
 * - Dead Letter Queue (size, retries)
 * - Active subscriptions
 */

import { Counter, Histogram, Gauge, Registry } from 'prom-client';

export class EventMetrics {
  private static instance: EventMetrics;
  private registry: Registry;

  // Counters
  private eventsPublishedTotal: Counter<string>;
  private eventsConsumedTotal: Counter<string>;
  private eventsFailedTotal: Counter<string>;
  private dlqEventsTotal: Counter<string>;

  // Histograms
  private eventPublishDuration: Histogram<string>;
  private eventConsumeDuration: Histogram<string>;

  // Gauges
  private dlqPendingCount: Gauge<string>;
  private activeSubscriptions: Gauge<string>;

  private constructor() {
    this.registry = new Registry();

    // Event publishing counter
    this.eventsPublishedTotal = new Counter({
      name: 'plexica_events_published_total',
      help: 'Total number of events published',
      labelNames: ['topic', 'event_type', 'tenant_id', 'source'],
      registers: [this.registry],
    });

    // Event consumption counter
    this.eventsConsumedTotal = new Counter({
      name: 'plexica_events_consumed_total',
      help: 'Total number of events consumed',
      labelNames: ['topic', 'event_type', 'tenant_id', 'consumer_group'],
      registers: [this.registry],
    });

    // Event failures counter
    this.eventsFailedTotal = new Counter({
      name: 'plexica_events_failed_total',
      help: 'Total number of event processing failures',
      labelNames: ['topic', 'event_type', 'tenant_id', 'error_type'],
      registers: [this.registry],
    });

    // DLQ events counter
    this.dlqEventsTotal = new Counter({
      name: 'plexica_dlq_events_total',
      help: 'Total number of events sent to DLQ',
      labelNames: ['topic', 'event_type', 'reason'],
      registers: [this.registry],
    });

    // Event publish duration histogram
    this.eventPublishDuration = new Histogram({
      name: 'plexica_event_publish_duration_ms',
      help: 'Duration of event publishing in milliseconds',
      labelNames: ['topic', 'event_type'],
      buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000],
      registers: [this.registry],
    });

    // Event consume duration histogram
    this.eventConsumeDuration = new Histogram({
      name: 'plexica_event_consume_duration_ms',
      help: 'Duration of event consumption in milliseconds',
      labelNames: ['topic', 'event_type', 'consumer_group'],
      buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2000],
      registers: [this.registry],
    });

    // DLQ pending count gauge
    this.dlqPendingCount = new Gauge({
      name: 'plexica_dlq_pending_count',
      help: 'Number of events pending in DLQ',
      labelNames: ['status'],
      registers: [this.registry],
    });

    // Active subscriptions gauge
    this.activeSubscriptions = new Gauge({
      name: 'plexica_active_subscriptions',
      help: 'Number of active event subscriptions',
      labelNames: ['topic', 'consumer_group'],
      registers: [this.registry],
    });
  }

  public static getInstance(): EventMetrics {
    if (!EventMetrics.instance) {
      EventMetrics.instance = new EventMetrics();
    }
    return EventMetrics.instance;
  }

  /**
   * Get Prometheus registry for metrics export
   */
  public getRegistry(): Registry {
    return this.registry;
  }

  /**
   * Get all metrics in Prometheus format
   */
  public async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  /**
   * Reset all metrics (useful for testing)
   */
  public reset(): void {
    this.registry.resetMetrics();
  }

  // ===========================
  // Publishing Metrics
  // ===========================

  /**
   * Record event published
   */
  public recordEventPublished(
    topic: string,
    eventType: string,
    tenantId: string,
    source: string
  ): void {
    this.eventsPublishedTotal.inc({
      topic,
      event_type: eventType,
      tenant_id: tenantId,
      source,
    });
  }

  /**
   * Record event publish duration
   */
  public recordEventPublishDuration(topic: string, eventType: string, durationMs: number): void {
    this.eventPublishDuration.observe(
      {
        topic,
        event_type: eventType,
      },
      durationMs
    );
  }

  // ===========================
  // Consumption Metrics
  // ===========================

  /**
   * Record event consumed
   */
  public recordEventConsumed(
    topic: string,
    eventType: string,
    tenantId: string,
    consumerGroup: string
  ): void {
    this.eventsConsumedTotal.inc({
      topic,
      event_type: eventType,
      tenant_id: tenantId,
      consumer_group: consumerGroup,
    });
  }

  /**
   * Record event consume duration
   */
  public recordEventConsumeDuration(
    topic: string,
    eventType: string,
    consumerGroup: string,
    durationMs: number
  ): void {
    this.eventConsumeDuration.observe(
      {
        topic,
        event_type: eventType,
        consumer_group: consumerGroup,
      },
      durationMs
    );
  }

  // ===========================
  // Failure Metrics
  // ===========================

  /**
   * Record event processing failure
   */
  public recordEventFailed(
    topic: string,
    eventType: string,
    tenantId: string,
    errorType: string
  ): void {
    this.eventsFailedTotal.inc({
      topic,
      event_type: eventType,
      tenant_id: tenantId,
      error_type: errorType,
    });
  }

  // ===========================
  // Dead Letter Queue Metrics
  // ===========================

  /**
   * Record event sent to DLQ
   */
  public recordDLQEvent(topic: string, eventType: string, reason: string): void {
    this.dlqEventsTotal.inc({
      topic,
      event_type: eventType,
      reason,
    });
  }

  /**
   * Update DLQ pending count
   */
  public setDLQPendingCount(
    status: 'PENDING' | 'RETRYING' | 'FAILED' | 'RESOLVED',
    count: number
  ): void {
    this.dlqPendingCount.set({ status }, count);
  }

  // ===========================
  // Subscription Metrics
  // ===========================

  /**
   * Increment active subscriptions
   */
  public incrementSubscriptions(topic: string, consumerGroup: string): void {
    this.activeSubscriptions.inc({ topic, consumer_group: consumerGroup });
  }

  /**
   * Decrement active subscriptions
   */
  public decrementSubscriptions(topic: string, consumerGroup: string): void {
    this.activeSubscriptions.dec({ topic, consumer_group: consumerGroup });
  }

  /**
   * Set active subscriptions count
   */
  public setSubscriptionsCount(topic: string, consumerGroup: string, count: number): void {
    this.activeSubscriptions.set({ topic, consumer_group: consumerGroup }, count);
  }
}

// Export singleton instance
export const eventMetrics = EventMetrics.getInstance();
