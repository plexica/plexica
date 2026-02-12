// File: packages/sdk/__tests__/event-client.test.ts

import { describe, it, expect, vi } from 'vitest';
import { EventClient } from '../src/event-client';
import { PluginEventClient } from '@plexica/event-bus';
import type { PluginContext, EventHandler } from '../src/types';

// ---------------------------------------------------------------------------
// Mock PluginEventClient
// ---------------------------------------------------------------------------

vi.mock('@plexica/event-bus', () => {
  const MockPluginEventClient = vi.fn().mockImplementation(() => ({
    publish: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockResolvedValue('sub-123'),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    unsubscribeAll: vi.fn().mockResolvedValue(undefined),
    getSubscriptionCount: vi.fn().mockReturnValue(3),
  }));

  return {
    PluginEventClient: MockPluginEventClient,
    EventBusService: vi.fn(),
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createContext(): PluginContext {
  return {
    pluginId: 'plugin-crm',
    tenantId: 'tenant-1',
    workspaceId: 'ws-1',
    userId: 'user-42',
  };
}

function createEventClient(context?: PluginContext) {
  const ctx = context ?? createContext();
  const mockEventBus = {} as any;

  return new EventClient({ eventBus: mockEventBus, context: ctx });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EventClient', () => {
  describe('constructor', () => {
    it('should create a PluginEventClient with context values', () => {
      const ctx = createContext();
      const mockEventBus = {} as any;

      new EventClient({ eventBus: mockEventBus, context: ctx });

      expect(PluginEventClient).toHaveBeenCalledWith(
        mockEventBus,
        'plugin-crm',
        'tenant-1',
        'ws-1',
        'user-42'
      );
    });
  });

  describe('publish()', () => {
    it('should delegate to PluginEventClient.publish', async () => {
      const client = createEventClient();
      const underlying = (client as any).client;

      await client.publish('contact.created', { id: '1', name: 'Alice' });

      expect(underlying.publish).toHaveBeenCalledWith(
        'contact.created',
        { id: '1', name: 'Alice' },
        { workspaceId: undefined, correlationId: undefined, causationId: undefined }
      );
    });

    it('should pass publish options', async () => {
      const client = createEventClient();
      const underlying = (client as any).client;

      await client.publish(
        'contact.updated',
        { id: '1' },
        {
          workspaceId: 'ws-2',
          correlationId: 'corr-1',
          causationId: 'cause-1',
        }
      );

      expect(underlying.publish).toHaveBeenCalledWith(
        'contact.updated',
        { id: '1' },
        { workspaceId: 'ws-2', correlationId: 'corr-1', causationId: 'cause-1' }
      );
    });
  });

  describe('subscribe()', () => {
    it('should delegate to PluginEventClient.subscribe', async () => {
      const client = createEventClient();
      const handler: EventHandler = async () => {};

      const subId = await client.subscribe('contact.created', handler);

      expect(subId).toBe('sub-123');

      const underlying = (client as any).client;
      expect(underlying.subscribe).toHaveBeenCalledWith('contact.created', handler, {
        workspaceId: undefined,
        fromBeginning: undefined,
        pluginId: undefined,
        coreEvent: undefined,
      });
    });

    it('should pass subscription options', async () => {
      const client = createEventClient();

      await client.subscribe('tenant.created', async () => {}, {
        coreEvent: true,
        fromBeginning: true,
      });

      const underlying = (client as any).client;
      expect(underlying.subscribe).toHaveBeenCalledWith('tenant.created', expect.any(Function), {
        workspaceId: undefined,
        fromBeginning: true,
        pluginId: undefined,
        coreEvent: true,
      });
    });

    it('should allow subscribing to another plugin events', async () => {
      const client = createEventClient();

      await client.subscribe('deal.closed', async () => {}, {
        pluginId: 'plugin-analytics',
      });

      const underlying = (client as any).client;
      expect(underlying.subscribe).toHaveBeenCalledWith(
        'deal.closed',
        expect.any(Function),
        expect.objectContaining({ pluginId: 'plugin-analytics' })
      );
    });
  });

  describe('unsubscribe()', () => {
    it('should delegate to PluginEventClient.unsubscribe', async () => {
      const client = createEventClient();
      await client.unsubscribe('sub-123');

      const underlying = (client as any).client;
      expect(underlying.unsubscribe).toHaveBeenCalledWith('sub-123');
    });
  });

  describe('unsubscribeAll()', () => {
    it('should delegate to PluginEventClient.unsubscribeAll', async () => {
      const client = createEventClient();
      await client.unsubscribeAll();

      const underlying = (client as any).client;
      expect(underlying.unsubscribeAll).toHaveBeenCalledOnce();
    });
  });

  describe('getSubscriptionCount()', () => {
    it('should return count from underlying client', () => {
      const client = createEventClient();
      expect(client.getSubscriptionCount()).toBe(3);
    });
  });

  describe('getUnderlyingClient()', () => {
    it('should return the PluginEventClient instance', () => {
      const client = createEventClient();
      const underlying = client.getUnderlyingClient();
      expect(underlying).toBeDefined();
      expect(underlying.publish).toBeDefined();
    });
  });

  describe('fromClient()', () => {
    it('should create an EventClient from an existing PluginEventClient', () => {
      const mockPEC = {
        publish: vi.fn(),
        subscribe: vi.fn(),
        unsubscribe: vi.fn(),
        unsubscribeAll: vi.fn(),
        getSubscriptionCount: vi.fn().mockReturnValue(5),
      } as unknown as PluginEventClient;

      const client = EventClient.fromClient(mockPEC);
      expect(client.getSubscriptionCount()).toBe(5);
      expect(client.getUnderlyingClient()).toBe(mockPEC);
    });
  });
});
