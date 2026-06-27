// SDK unit tests

import { describe, expect, it, vi } from 'vitest';

// Mock kafkajs — use function declaration (not arrow) so `new Kafka()` works
vi.mock('kafkajs', () => {
  const mockConnect = vi.fn().mockResolvedValue(undefined);
  const mockSend = vi.fn().mockResolvedValue(undefined);
  const mockDisconnect = vi.fn().mockResolvedValue(undefined);
  const mockSubscribe = vi.fn().mockResolvedValue(undefined);
  const mockRun = vi.fn().mockResolvedValue(undefined);

  return {
    Kafka: vi.fn(function MockKafka() {
      return {
        producer: () => ({ connect: mockConnect, send: mockSend, disconnect: mockDisconnect }),
        consumer: () => ({ connect: mockConnect, subscribe: mockSubscribe, run: mockRun, disconnect: mockDisconnect }),
      };
    }),
    logLevel: { ERROR: 4, INFO: 2, DEBUG: 1, NOTHING: 5, WARN: 3 },
  };
});

const { PluginSDK } = await import('../src/index.js');

describe('PluginSDK', () => {
  it('constructs with config', () => {
    const sdk = new PluginSDK({ pluginId: 'test', tenantId: 't1', kafkaBrokers: 'localhost:9092', apiUrl: 'http://localhost:3001' });
    expect(sdk).toBeDefined();
  });

  it('initialize connects to Kafka', async () => {
    const sdk = new PluginSDK({ pluginId: 'test', tenantId: 't1', kafkaBrokers: 'localhost:9092', apiUrl: 'http://localhost:3001' });
    await expect(sdk.initialize()).resolves.toBeUndefined();
    await sdk.destroy();
  });

  it('getContext returns tenant info', () => {
    const sdk = new PluginSDK({ pluginId: 'test', tenantId: 't1', workspaceId: 'w1', kafkaBrokers: '', apiUrl: '' });
    const ctx = sdk.getContext();
    expect(ctx.tenantId).toBe('t1');
    expect(ctx.workspaceId).toBe('w1');
  });

  it('onEvent throws when not initialized', () => {
    const sdk = new PluginSDK({ pluginId: 'test', tenantId: 't1', kafkaBrokers: '', apiUrl: '' });
    expect(() => sdk.onEvent('test.event', async () => {})).toThrow('not initialized');
  });

  it('getDb throws with helpful message', () => {
    const sdk = new PluginSDK({ pluginId: 'test', tenantId: 't1', kafkaBrokers: '', apiUrl: '' });
    expect(() => sdk.getDb()).toThrow('Direct database access');
  });

  it('onEvent registers handler after initialize', async () => {
    const sdk = new PluginSDK({ pluginId: 'test', tenantId: 't1', kafkaBrokers: 'localhost:9092', apiUrl: 'http://localhost:3001' });
    await sdk.initialize();
    expect(() => sdk.onEvent('test.event', async () => {})).not.toThrow();
    await sdk.destroy();
  });
});
