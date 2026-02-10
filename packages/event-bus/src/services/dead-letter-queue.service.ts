// @ts-nocheck
import type { DomainEvent } from '../types';
import { TopicManager } from './topic-manager';
import { RedpandaClient } from './redpanda-client';
import type { Producer } from 'kafkajs';
import { eventMetrics } from '../metrics/event-metrics';
import { sanitizeTimeoutMs } from '../../../lib/safe-timeout.helper';

/**
 * Failed event record stored in DLQ
 */
export interface FailedEvent {
  id: string; // UUID
  originalEvent: DomainEvent;
  originalTopic: string;
  failureReason: string;
  failureTimestamp: Date;
  retryCount: number;
  maxRetries: number;
  lastRetryTimestamp?: Date;
  stackTrace?: string;
  consumerGroup?: string;
  partition?: number;
  offset?: string;
}

/**
 * DLQ configuration
 */
export interface DLQConfig {
  maxRetries: number; // Max retry attempts before giving up
  retryDelayMs: number; // Delay between retries (exponential backoff)
  retentionDays: number; // How long to keep failed events
  topicPrefix: string; // DLQ topic prefix (default: 'dlq')
}

/**
 * DLQ statistics
 */
export interface DLQStats {
  totalFailed: number;
  pendingRetry: number;
  maxRetriesExceeded: number;
  successfulRetries: number;
  byTopic: Record<string, number>;
  byReason: Record<string, number>;
}

/**
 * Dead Letter Queue Service
 *
 * Handles failed events with:
 * - Automatic routing to DLQ topics
 * - Retry mechanisms with exponential backoff
 * - Failed event tracking and analytics
 * - Manual retry capabilities
 * - Event inspection and debugging
 */
export class DeadLetterQueueService {
  private producer: Producer;
  private topicManager: TopicManager;
  private config: DLQConfig = {
    maxRetries: 3,
    retryDelayMs: 1000, // 1 second base delay
    retentionDays: 30,
    topicPrefix: 'dlq',
  };

  // In-memory tracking (in production, use database)
  private failedEvents: Map<string, FailedEvent> = new Map();
  private stats: DLQStats = {
    totalFailed: 0,
    pendingRetry: 0,
    maxRetriesExceeded: 0,
    successfulRetries: 0,
    byTopic: {},
    byReason: {},
  };

  constructor(
    private client: RedpandaClient,
    config?: Partial<DLQConfig>
  ) {
    this.producer = client.getProducer();
    this.topicManager = new TopicManager(client);

    if (config) {
      this.config = { ...this.config, ...config };
    }
  }

  /**
   * Route a failed event to DLQ
   */
  async routeToDLQ(
    event: DomainEvent,
    originalTopic: string,
    error: Error,
    metadata?: {
      consumerGroup?: string;
      partition?: number;
      offset?: string;
    }
  ): Promise<void> {
    try {
      // Check if event already failed before
      const existingFailure = Array.from(this.failedEvents.values()).find(
        (f) => f.originalEvent.id === event.id
      );

      let retryCount = 0;
      if (existingFailure) {
        retryCount = existingFailure.retryCount + 1;

        // Check if max retries exceeded
        if (retryCount >= this.config.maxRetries) {
          await this.handleMaxRetriesExceeded(event, existingFailure, error);
          return;
        }
      }

      // Create failed event record
      const failedEvent: FailedEvent = {
        id: existingFailure?.id || `dlq-${event.id}-${Date.now()}`,
        originalEvent: event,
        originalTopic,
        failureReason: error.message,
        failureTimestamp: new Date(),
        retryCount,
        maxRetries: this.config.maxRetries,
        stackTrace: error.stack,
        consumerGroup: metadata?.consumerGroup,
        partition: metadata?.partition,
        offset: metadata?.offset,
      };

      // Store in tracking map
      this.failedEvents.set(failedEvent.id, failedEvent);

      // Build DLQ topic name
      const dlqTopic = this.buildDLQTopicName(originalTopic);

      // Ensure DLQ topic exists
      await this.ensureDLQTopic(dlqTopic);

      // Send to DLQ topic
      await this.producer.send({
        topic: dlqTopic,
        messages: [
          {
            key: event.tenantId, // Partition by tenant
            value: Buffer.from(JSON.stringify(failedEvent), 'utf-8'),
            headers: {
              'dlq-id': failedEvent.id,
              'original-topic': originalTopic,
              'original-event-id': event.id,
              'retry-count': String(retryCount),
              'failure-reason': error.message.substring(0, 200), // Truncate
              'tenant-id': event.tenantId,
            },
          },
        ],
      });

      // Update statistics
      this.updateStats(originalTopic, error.message, 'failed');

      // Record DLQ metrics
      eventMetrics.recordDLQEvent(originalTopic, event.type, error.constructor.name);

      console.error(
        `📥 Event routed to DLQ [${failedEvent.id}]: ${event.type} (retry ${retryCount}/${this.config.maxRetries})`
      );
    } catch (dlqError) {
      console.error('❌ Critical: Failed to route event to DLQ:', dlqError);
      // TODO: Fallback to persistent storage (database, file system)
      throw dlqError;
    }
  }

  /**
   * Retry a failed event
   */
  async retryFailedEvent(failedEventId: string, manualRetry: boolean = false): Promise<boolean> {
    const failedEvent = this.failedEvents.get(failedEventId);
    if (!failedEvent) {
      throw new Error(`Failed event not found: ${failedEventId}`);
    }

    // Check retry count
    if (!manualRetry && failedEvent.retryCount >= failedEvent.maxRetries) {
      throw new Error(
        `Max retries exceeded for event: ${failedEventId} (${failedEvent.retryCount}/${failedEvent.maxRetries})`
      );
    }

    // Calculate backoff delay (exponential)
    const delayMs = this.calculateBackoffDelay(failedEvent.retryCount);

    if (!manualRetry) {
      // Wait for backoff period (sanitize and clamp to safe range)
      const safeDelay = sanitizeTimeoutMs(delayMs);
      await new Promise((resolve) => setTimeout(resolve, safeDelay));
    }

    try {
      // Re-publish to original topic
      const serializedEvent = Buffer.from(
        JSON.stringify({
          ...failedEvent.originalEvent,
          timestamp:
            failedEvent.originalEvent.timestamp instanceof Date
              ? failedEvent.originalEvent.timestamp.toISOString()
              : failedEvent.originalEvent.timestamp,
        }),
        'utf-8'
      );

      await this.producer.send({
        topic: failedEvent.originalTopic,
        messages: [
          {
            key: failedEvent.originalEvent.tenantId,
            value: serializedEvent,
            headers: {
              'x-retry-attempt': String(failedEvent.retryCount + 1),
              'x-dlq-id': failedEvent.id,
              'x-original-failure': failedEvent.failureReason,
            },
          },
        ],
      });

      // Update tracking
      failedEvent.lastRetryTimestamp = new Date();
      failedEvent.retryCount++;

      // Update statistics
      this.updateStats(failedEvent.originalTopic, failedEvent.failureReason, 'retry-success');

      console.log(
        `♻️  Event retried successfully [${failedEventId}]: ${failedEvent.originalEvent.type}`
      );

      return true;
    } catch (error) {
      console.error(`❌ Retry failed for event ${failedEventId}:`, error);

      // Route back to DLQ
      await this.routeToDLQ(failedEvent.originalEvent, failedEvent.originalTopic, error as Error, {
        consumerGroup: failedEvent.consumerGroup,
        partition: failedEvent.partition,
        offset: failedEvent.offset,
      });

      return false;
    }
  }

  /**
   * Retry all failed events for a topic
   */
  async retryAllForTopic(topic: string): Promise<{
    succeeded: number;
    failed: number;
  }> {
    const failedEventsForTopic = Array.from(this.failedEvents.values()).filter(
      (f) => f.originalTopic === topic && f.retryCount < f.maxRetries
    );

    let succeeded = 0;
    let failed = 0;

    for (const failedEvent of failedEventsForTopic) {
      const success = await this.retryFailedEvent(failedEvent.id, true);
      if (success) {
        succeeded++;
      } else {
        failed++;
      }
    }

    return { succeeded, failed };
  }

  /**
   * Get failed events with filtering
   */
  getFailedEvents(filter?: {
    topic?: string;
    tenantId?: string;
    status?: 'pending' | 'max-retries-exceeded';
  }): FailedEvent[] {
    let events = Array.from(this.failedEvents.values());

    if (filter?.topic) {
      events = events.filter((e) => e.originalTopic === filter.topic);
    }

    if (filter?.tenantId) {
      events = events.filter((e) => e.originalEvent.tenantId === filter.tenantId);
    }

    if (filter?.status === 'pending') {
      events = events.filter((e) => e.retryCount < e.maxRetries);
    } else if (filter?.status === 'max-retries-exceeded') {
      events = events.filter((e) => e.retryCount >= e.maxRetries);
    }

    return events.sort((a, b) => b.failureTimestamp.getTime() - a.failureTimestamp.getTime());
  }

  /**
   * Get a specific failed event
   */
  getFailedEvent(id: string): FailedEvent | undefined {
    return this.failedEvents.get(id);
  }

  /**
   * Delete a failed event from DLQ
   */
  async deleteFailedEvent(id: string): Promise<boolean> {
    const deleted = this.failedEvents.delete(id);
    if (!deleted) {
      return false;
    }

    // TODO: Also delete from DLQ topic in Redpanda
    console.log(`🗑️  Failed event deleted: ${id}`);
    return true;
  }

  /**
   * Get DLQ statistics
   */
  getStats(): DLQStats {
    // Recalculate pending and max retries counts
    let pending = 0;
    let maxRetriesExceeded = 0;

    for (const failedEvent of this.failedEvents.values()) {
      if (failedEvent.retryCount >= failedEvent.maxRetries) {
        maxRetriesExceeded++;
      } else {
        pending++;
      }
    }

    // Update metrics
    eventMetrics.setDLQPendingCount('PENDING', pending);
    eventMetrics.setDLQPendingCount('FAILED', maxRetriesExceeded);
    eventMetrics.setDLQPendingCount('RESOLVED', this.stats.successfulRetries);

    return {
      ...this.stats,
      pendingRetry: pending,
      maxRetriesExceeded,
    };
  }

  /**
   * Build DLQ topic name
   */
  private buildDLQTopicName(originalTopic: string): string {
    return `${this.config.topicPrefix}.${originalTopic}`;
  }

  /**
   * Ensure DLQ topic exists
   */
  private async ensureDLQTopic(dlqTopic: string): Promise<void> {
    const exists = await this.topicManager.topicExists(dlqTopic);
    if (!exists) {
      await this.topicManager.createTopic(dlqTopic, {
        numPartitions: 3,
        replicationFactor: 3,
        retentionMs: this.config.retentionDays * 24 * 60 * 60 * 1000,
        cleanupPolicy: 'delete',
      });
    }
  }

  /**
   * Handle max retries exceeded
   */
  private async handleMaxRetriesExceeded(
    event: DomainEvent,
    failedEvent: FailedEvent,
    error: Error
  ): Promise<void> {
    console.error(`🚨 Max retries exceeded for event [${failedEvent.id}]: ${event.type}`);

    // Update tracking
    failedEvent.retryCount = failedEvent.maxRetries;
    failedEvent.lastRetryTimestamp = new Date();

    // Update statistics
    this.updateStats(failedEvent.originalTopic, error.message, 'max-retries-exceeded');

    // TODO: Send alert/notification
    // TODO: Store in permanent dead letter storage
  }

  /**
   * Calculate exponential backoff delay
   */
  private calculateBackoffDelay(retryCount: number): number {
    // Exponential backoff: baseDelay * (2 ^ retryCount)
    const delay = this.config.retryDelayMs * Math.pow(2, retryCount);

    // Cap at 1 hour
    const maxDelay = 60 * 60 * 1000;
    return Math.min(delay, maxDelay);
  }

  /**
   * Update statistics
   */
  private updateStats(
    topic: string,
    reason: string,
    type: 'failed' | 'retry-success' | 'max-retries-exceeded'
  ): void {
    if (type === 'failed') {
      this.stats.totalFailed++;
      this.stats.byTopic[topic] = (this.stats.byTopic[topic] || 0) + 1;
      this.stats.byReason[reason] = (this.stats.byReason[reason] || 0) + 1;
    } else if (type === 'retry-success') {
      this.stats.successfulRetries++;
    } else if (type === 'max-retries-exceeded') {
      this.stats.maxRetriesExceeded++;
    }
  }
}
