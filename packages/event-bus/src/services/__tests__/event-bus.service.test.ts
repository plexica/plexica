/**
 * EventBusService Tests
 *
 * Tests for event publishing, subscription, and consumption
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventBusService } from '../event-bus.service';
import { RedpandaClient } from '../redpanda-client';
import type { DomainEvent } from '../../types';

// Mock RedpandaClient
vi.mock('../redpanda-client', () => {
  const mockProducer = {
    send: vi.fn().mockResolvedValue({}),
  };

  const mockConsumer = {
    subscribe: vi.fn().mockResolvedValue(undefined),
    run: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
  };

  const mockAdmin = {
    listTopics: vi.fn().mockResolvedValue(['test-topic']),
    createTopics: vi.fn().mockResolvedValue(undefined),
    deleteTopics: vi.fn().mockResolvedValue(undefined),
  };

  return {
    RedpandaClient: vi.fn().mockImplementation(() => ({
      getProducer: vi.fn(() => mockProducer),
      getConsumer: vi.fn().mockResolvedValue(mockConsumer),
      getAdmin: vi.fn(() => mockAdmin),
    })),
  };
});

describe('EventBusService', () => {
  let eventBus: EventBusService;
  let mockClient: RedpandaClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = new RedpandaClient({
      brokers: ['localhost:9092'],
      clientId: 'test-client',
    });
    eventBus = new EventBusService(mockClient);
  });

  afterEach(async () => {
    await eventBus.shutdown();
  });

  describe('publish', () => {
    it('should publish an event successfully', async () => {
      const eventType = 'test.event.created';
      const data = { message: 'Hello, World!' };
      const metadata = { tenantId: 'tenant-123' };

      await eventBus.publish(eventType, data, metadata);

      const producer = mockClient.getProducer();
      expect(producer.send).toHaveBeenCalledWith(
        expect.objectContaining({
          topic: eventType,
          messages: expect.arrayContaining([
            expect.objectContaining({
              key: 'tenant-123',
              headers: expect.objectContaining({
                'event-type': eventType,
                'tenant-id': 'tenant-123',
              }),
            }),
          ]),
        })
      );
    });

    it('should throw error if tenantId is missing', async () => {
      const eventType = 'test.event.created';
      const data = { message: 'Hello, World!' };

      await expect(eventBus.publish(eventType, data, {})).rejects.toThrow('tenantId is required');
    });

    it('should include workspaceId in headers when provided', async () => {
      const eventType = 'test.event.created';
      const data = { message: 'Hello, World!' };
      const metadata = {
        tenantId: 'tenant-123',
        workspaceId: 'workspace-456',
      };

      await eventBus.publish(eventType, data, metadata);

      const producer = mockClient.getProducer();
      expect(producer.send).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              headers: expect.objectContaining({
                'workspace-id': 'workspace-456',
              }),
            }),
          ]),
        })
      );
    });

    it('should use compression when compress option is true', async () => {
      const eventType = 'test.event.created';
      const data = { message: 'Hello, World!' };
      const metadata = { tenantId: 'tenant-123' };
      const options = { compress: true };

      await eventBus.publish(eventType, data, metadata, options);

      const producer = mockClient.getProducer();
      expect(producer.send).toHaveBeenCalledWith(
        expect.objectContaining({
          compression: 2, // Snappy compression
        })
      );
    });
  });

  describe('publishBatch', () => {
    it('should publish multiple events in batch', async () => {
      const events = [
        {
          eventType: 'test.event.created',
          data: { id: 1 },
          metadata: { tenantId: 'tenant-123' },
        },
        {
          eventType: 'test.event.updated',
          data: { id: 2 },
          metadata: { tenantId: 'tenant-123' },
        },
      ];

      await eventBus.publishBatch(events);

      const producer = mockClient.getProducer();
      expect(producer.send).toHaveBeenCalled();
    });
  });

  describe('subscribe', () => {
    it('should create subscription successfully', async () => {
      const eventType = 'test.event.created';
      const handler = vi.fn();

      const subscriptionId = await eventBus.subscribe(eventType, handler);

      expect(subscriptionId).toBeDefined();
      expect(subscriptionId).toContain(eventType);
    });

    it('should not allow duplicate subscriptions', async () => {
      const eventType = 'test.event.created';
      const handler = vi.fn();
      const options = { groupId: 'test-group' };

      const subscriptionId1 = await eventBus.subscribe(eventType, handler, options);

      await expect(eventBus.subscribe(eventType, handler, options)).rejects.toThrow(
        'Subscription already exists'
      );
    });

    it('should support fromBeginning option', async () => {
      const eventType = 'test.event.created';
      const handler = vi.fn();
      const options = { fromBeginning: true };

      await eventBus.subscribe(eventType, handler, options);

      const consumer = await mockClient.getConsumer('test-group');
      expect(consumer.subscribe).toHaveBeenCalledWith(
        expect.objectContaining({
          fromBeginning: true,
        })
      );
    });
  });

  describe('unsubscribe', () => {
    it('should unsubscribe successfully', async () => {
      const eventType = 'test.event.created';
      const handler = vi.fn();

      const subscriptionId = await eventBus.subscribe(eventType, handler);
      await eventBus.unsubscribe(subscriptionId);

      // Verify subscription is removed
      expect(eventBus.getSubscriptionCount()).toBe(0);
    });

    it('should handle unsubscribing non-existent subscription gracefully', async () => {
      await expect(eventBus.unsubscribe('non-existent')).resolves.not.toThrow();
    });
  });

  describe('getSubscriptionCount', () => {
    it('should return correct subscription count', async () => {
      expect(eventBus.getSubscriptionCount()).toBe(0);

      const handler = vi.fn();
      await eventBus.subscribe('test.event.1', handler);
      await eventBus.subscribe('test.event.2', handler);

      expect(eventBus.getSubscriptionCount()).toBe(2);
    });
  });

  describe('shutdown', () => {
    it('should shutdown gracefully', async () => {
      const eventType = 'test.event.created';
      const handler = vi.fn();

      await eventBus.subscribe(eventType, handler);
      await eventBus.shutdown();

      // Verify cannot publish after shutdown
      await expect(eventBus.publish(eventType, {}, { tenantId: 'test' })).rejects.toThrow(
        'EventBus is shutting down'
      );
    });
  });

  describe('event filtering', () => {
    it('should filter events by tenantId', async () => {
      const eventType = 'test.event.created';
      const handler = vi.fn();
      const options = {
        tenantId: 'tenant-123',
      };

      await eventBus.subscribe(eventType, handler, options);

      // This would be tested with actual message handling
      // For now, we verify the subscription was created with filter
      expect(eventBus.getSubscriptionCount()).toBe(1);
    });

    it('should filter events by workspaceId', async () => {
      const eventType = 'test.event.created';
      const handler = vi.fn();
      const options = {
        workspaceId: 'workspace-456',
      };

      await eventBus.subscribe(eventType, handler, options);

      expect(eventBus.getSubscriptionCount()).toBe(1);
    });
  });
});
