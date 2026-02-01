/**
 * DeadLetterQueueService Tests
 *
 * Tests for DLQ event routing, retry logic, and management
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DeadLetterQueueService } from '../dead-letter-queue.service';
import { RedpandaClient } from '../redpanda-client';
import type { DomainEvent } from '../../types';

// Mock RedpandaClient
vi.mock('../redpanda-client', () => {
  const mockProducer = {
    send: vi.fn().mockResolvedValue({}),
  };

  return {
    RedpandaClient: vi.fn().mockImplementation(() => ({
      getProducer: () => mockProducer,
      getAdmin: () => ({
        listTopics: vi.fn().mockResolvedValue([]),
        createTopics: vi.fn().mockResolvedValue(undefined),
      }),
    })),
  };
});

describe('DeadLetterQueueService', () => {
  let dlqService: DeadLetterQueueService;
  let mockClient: RedpandaClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = new RedpandaClient({
      brokers: ['localhost:9092'],
      clientId: 'test-client',
    });
    dlqService = new DeadLetterQueueService(mockClient);
  });

  describe('routeToDLQ', () => {
    it('should route failed event to DLQ topic', async () => {
      const event: DomainEvent = {
        id: 'event-123',
        type: 'test.event.created',
        tenantId: 'tenant-123',
        timestamp: new Date(),
        data: { message: 'test' },
        metadata: {
          source: 'test-service',
        },
      };

      const error = new Error('Processing failed');

      await dlqService.routeToDLQ(event, 'test.event.created', error);

      const producer = mockClient.getProducer();
      expect(producer.send).toHaveBeenCalledWith(
        expect.objectContaining({
          topic: expect.stringContaining('dlq.test.event.created'),
          messages: expect.arrayContaining([
            expect.objectContaining({
              key: 'tenant-123',
              headers: expect.objectContaining({
                'original-topic': 'test.event.created',
                'original-event-id': 'event-123',
                'retry-count': '0',
                'tenant-id': 'tenant-123',
              }),
            }),
          ]),
        })
      );
    });

    it('should increment retry count on subsequent failures', async () => {
      const event: DomainEvent = {
        id: 'event-123',
        type: 'test.event.created',
        tenantId: 'tenant-123',
        timestamp: new Date(),
        data: { message: 'test' },
        metadata: {
          source: 'test-service',
        },
      };

      const error = new Error('Processing failed');

      // First failure
      await dlqService.routeToDLQ(event, 'test.event.created', error);

      // Second failure
      await dlqService.routeToDLQ(event, 'test.event.created', error);

      const producer = mockClient.getProducer();
      const calls = (producer.send as any).mock.calls;

      expect(calls[1][0].messages[0].headers['retry-count']).toBe('1');
    });

    it('should not retry after max retries exceeded', async () => {
      const event: DomainEvent = {
        id: 'event-123',
        type: 'test.event.created',
        tenantId: 'tenant-123',
        timestamp: new Date(),
        data: { message: 'test' },
        metadata: {
          source: 'test-service',
        },
      };

      const error = new Error('Processing failed');

      // Configure with max 2 retries
      const dlqServiceWithMaxRetries = new DeadLetterQueueService(mockClient, {
        maxRetries: 2,
      });

      // Trigger failures until max retries
      await dlqServiceWithMaxRetries.routeToDLQ(event, 'test.event.created', error);
      await dlqServiceWithMaxRetries.routeToDLQ(event, 'test.event.created', error);
      await dlqServiceWithMaxRetries.routeToDLQ(event, 'test.event.created', error);

      const stats = dlqServiceWithMaxRetries.getStats();
      expect(stats.maxRetriesExceeded).toBe(1);
    });
  });

  describe('getStats', () => {
    it('should return correct DLQ statistics', async () => {
      const event: DomainEvent = {
        id: 'event-123',
        type: 'test.event.created',
        tenantId: 'tenant-123',
        timestamp: new Date(),
        data: { message: 'test' },
        metadata: {
          source: 'test-service',
        },
      };

      const error = new Error('Processing failed');

      await dlqService.routeToDLQ(event, 'test.event.created', error);

      const stats = dlqService.getStats();

      expect(stats.totalFailed).toBeGreaterThan(0);
      expect(stats.pendingRetry).toBeGreaterThan(0);
      expect(stats.byTopic).toHaveProperty('test.event.created');
    });

    it('should track failures by reason', async () => {
      const event: DomainEvent = {
        id: 'event-123',
        type: 'test.event.created',
        tenantId: 'tenant-123',
        timestamp: new Date(),
        data: { message: 'test' },
        metadata: {
          source: 'test-service',
        },
      };

      const error = new Error('Validation error');

      await dlqService.routeToDLQ(event, 'test.event.created', error);

      const stats = dlqService.getStats();

      expect(stats.byReason).toHaveProperty('Validation error');
    });
  });

  describe('getFailedEvents', () => {
    it('should list all failed events', async () => {
      const event1: DomainEvent = {
        id: 'event-1',
        type: 'test.event.created',
        tenantId: 'tenant-123',
        timestamp: new Date(),
        data: { message: 'test 1' },
        metadata: { source: 'test-service' },
      };

      const event2: DomainEvent = {
        id: 'event-2',
        type: 'test.event.updated',
        tenantId: 'tenant-123',
        timestamp: new Date(),
        data: { message: 'test 2' },
        metadata: { source: 'test-service' },
      };

      await dlqService.routeToDLQ(event1, 'test.event.created', new Error('Error 1'));
      await dlqService.routeToDLQ(event2, 'test.event.updated', new Error('Error 2'));

      const failedEvents = dlqService.getFailedEvents();

      expect(failedEvents.length).toBe(2);
    });

    it('should filter failed events by topic', async () => {
      const event1: DomainEvent = {
        id: 'event-1',
        type: 'test.event.created',
        tenantId: 'tenant-123',
        timestamp: new Date(),
        data: { message: 'test 1' },
        metadata: { source: 'test-service' },
      };

      const event2: DomainEvent = {
        id: 'event-2',
        type: 'test.event.updated',
        tenantId: 'tenant-123',
        timestamp: new Date(),
        data: { message: 'test 2' },
        metadata: { source: 'test-service' },
      };

      await dlqService.routeToDLQ(event1, 'test.event.created', new Error('Error 1'));
      await dlqService.routeToDLQ(event2, 'test.event.updated', new Error('Error 2'));

      const failedEvents = dlqService.getFailedEvents({ topic: 'test.event.created' });

      expect(failedEvents.length).toBe(1);
      expect(failedEvents[0].originalTopic).toBe('test.event.created');
    });
  });

  describe('getFailedEvent', () => {
    it('should retrieve specific failed event by ID', async () => {
      const event: DomainEvent = {
        id: 'event-123',
        type: 'test.event.created',
        tenantId: 'tenant-123',
        timestamp: new Date(),
        data: { message: 'test' },
        metadata: { source: 'test-service' },
      };

      await dlqService.routeToDLQ(event, 'test.event.created', new Error('Test error'));

      const failedEvents = dlqService.getFailedEvents();
      const failedEventId = failedEvents[0].id;

      const retrieved = dlqService.getFailedEvent(failedEventId);

      expect(retrieved).toBeDefined();
      expect(retrieved?.originalEvent.id).toBe('event-123');
    });

    it('should return undefined for non-existent event', () => {
      const retrieved = dlqService.getFailedEvent('non-existent-id');

      expect(retrieved).toBeUndefined();
    });
  });

  describe('deleteFailedEvent', () => {
    it('should delete failed event successfully', async () => {
      const event: DomainEvent = {
        id: 'event-123',
        type: 'test.event.created',
        tenantId: 'tenant-123',
        timestamp: new Date(),
        data: { message: 'test' },
        metadata: { source: 'test-service' },
      };

      await dlqService.routeToDLQ(event, 'test.event.created', new Error('Test error'));

      const failedEvents = dlqService.getFailedEvents();
      const failedEventId = failedEvents[0].id;

      const deleted = await dlqService.deleteFailedEvent(failedEventId);

      expect(deleted).toBe(true);
      expect(dlqService.getFailedEvent(failedEventId)).toBeUndefined();
    });

    it('should return false when deleting non-existent event', async () => {
      const deleted = await dlqService.deleteFailedEvent('non-existent-id');

      expect(deleted).toBe(false);
    });
  });
});
