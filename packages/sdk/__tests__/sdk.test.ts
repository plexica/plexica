// SDK unit tests — match the actual PluginSDK API.
// The SDK no longer imports kafkajs (core manages Kafka); the dead mock is gone.
// callApi / emitEvent are HTTP-backed, so we stub global fetch per test.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { PluginSDK } = await import('../src/index.js');

import type { PluginEvent } from '../src/types.js';

function makeEvent(type: string, payload: unknown = {}): PluginEvent {
  return {
    eventId: crypto.randomUUID(),
    type,
    schemaVersion: 1,
    tenantId: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
    producer: { kind: 'core', id: 'core' },
    payload,
    correlationId: crypto.randomUUID(),
    causationId: null,
  };
}

function mockFetchOk(): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: () => Promise.resolve(''),
  } as unknown as Response);
}

describe('PluginSDK', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function makeSdk(overrides: Record<string, unknown> = {}): InstanceType<typeof PluginSDK> {
    return new PluginSDK({
      pluginId: 'test',
      slug: 'test-plugin',
      tenantId: 't1',
      apiUrl: 'http://localhost:3001',
      ...overrides,
    });
  }

  it('constructs with config and defaults apiUrl', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sdk = new PluginSDK({ pluginId: 'p', slug: 'p-slug', tenantId: 't1', apiUrl: '' } as any);
    expect(sdk).toBeDefined();
    expect(sdk.getContext().tenantId).toBe('t1');
  });

  it('onEvent stores a handler without requiring initialize()', () => {
    const sdk = makeSdk();
    const handler = vi.fn();
    expect(() => sdk.onEvent('test.event', handler)).not.toThrow();
  });

  it('dispatchEvent invokes the matching registered handler', async () => {
    const sdk = makeSdk();
    const handler = vi.fn();
    sdk.onEvent('test.event', handler);
    await sdk.initialize();
    const event = makeEvent('test.event', { x: 1 });
    await sdk.dispatchEvent(event);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(event);
    await sdk.destroy();
  });

  it('dispatchEvent rejects when not initialized', async () => {
    const sdk = makeSdk();
    await expect(sdk.dispatchEvent(makeEvent('x'))).rejects.toThrow('not initialized');
  });

  it('glob pattern: plexica.workspace.* matches plexica.workspace.created', async () => {
    const sdk = makeSdk();
    const handler = vi.fn();
    sdk.onEvent('plexica.workspace.*', handler);
    await sdk.initialize();
    await sdk.dispatchEvent(makeEvent('plexica.workspace.created'));
    expect(handler).toHaveBeenCalledTimes(1);
    await sdk.destroy();
  });

  it('glob pattern does not match unrelated event types', async () => {
    const sdk = makeSdk();
    const handler = vi.fn();
    sdk.onEvent('plexica.workspace.*', handler);
    await sdk.initialize();
    await sdk.dispatchEvent(makeEvent('plexica.tenant.created'));
    expect(handler).not.toHaveBeenCalled();
    await sdk.destroy();
  });

  it('getDb() rejects when DATABASE_URL is not set and no dbConnectionString', async () => {
    const sdk = makeSdk();
    const orig = process.env['DATABASE_URL'];
    delete process.env['DATABASE_URL'];
    await expect(sdk.getDb()).rejects.toThrow('platform runtime');
    if (orig) process.env['DATABASE_URL'] = orig;
  });

  it('getDb() attempts connection when dbConnectionString is provided', async () => {
    const sdk = makeSdk({ dbConnectionString: 'postgresql://test@localhost/test' });
    try {
      await sdk.getDb();
    } catch (err: unknown) {
      expect((err as Error).message).not.toContain('platform runtime');
    }
    await sdk.destroy();
  });

  it('getContext() returns tenantId, userId, workspaceId, role', () => {
    const sdk = makeSdk({
      plexicaHeaders: { tenantId: 't9', userId: 'u1', workspaceId: 'w2', role: 'admin' },
    });
    expect(sdk.getContext()).toEqual({
      tenantId: 't9',
      userId: 'u1',
      workspaceId: 'w2',
      role: 'admin',
    });
  });

  it('getContext() falls back to config + viewer defaults', () => {
    const sdk = makeSdk({ workspaceId: 'w-default' });
    const ctx = sdk.getContext();
    expect(ctx.tenantId).toBe('t1');
    expect(ctx.workspaceId).toBe('w-default');
    expect(ctx.userId).toBe('');
    expect(ctx.role).toBe('viewer');
  });

  it('callApi injects X-Plexica-* context headers and Authorization', async () => {
    const fetchMock = mockFetchOk();
    vi.stubGlobal('fetch', fetchMock);
    const sdk = makeSdk({
      accessToken: 'tok-123',
      plexicaHeaders: {
        tenantId: 't1', userId: 'u1', workspaceId: 'w1', role: 'admin', correlationId: 'c1',
      },
    });
    await sdk.initialize();
    await sdk.callApi('GET', '/api/v1/plugins');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstCall = fetchMock.mock.calls[0];
    expect(firstCall).toBeDefined();
    const [, init] = firstCall as [string, RequestInit];
    const headers = (init as { headers: Record<string, string> }).headers;
    expect(headers['X-Plexica-Tenant-Id']).toBe('t1');
    expect(headers['X-Plexica-User-Id']).toBe('u1');
    expect(headers['X-Plexica-Workspace-Id']).toBe('w1');
    expect(headers['X-Plexica-User-Role']).toBe('admin');
    expect(headers['X-Plexica-Correlation-Id']).toBe('c1');
    expect(headers['Authorization']).toBe('Bearer tok-123');
    await sdk.destroy();
  });

  it('callApi rejects on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 500, text: () => Promise.resolve('boom'),
    } as unknown as Response));
    const sdk = makeSdk();
    await sdk.initialize();
    await expect(sdk.callApi('GET', '/x')).rejects.toThrow('500');
    await sdk.destroy();
  });

  it('emitEvent POSTs to /api/v1/events/emit with a plugin-prefixed type', async () => {
    const fetchMock = mockFetchOk();
    vi.stubGlobal('fetch', fetchMock);
    const sdk = makeSdk({ accessToken: 'tok' });
    await sdk.initialize();
    await sdk.emitEvent('custom.happened', { foo: 'bar' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstCall = fetchMock.mock.calls[0];
    expect(firstCall).toBeDefined();
    const [url, init] = firstCall as [string, RequestInit];
    expect(url).toBe('http://localhost:3001/api/v1/events/emit');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body.type).toBe('plugin.test-plugin.custom.happened');
    expect(body.payload).toEqual({ foo: 'bar' });
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer tok');
    await sdk.destroy();
  });

  it('emitEvent rejects when not initialized', async () => {
    const sdk = makeSdk();
    await expect(sdk.emitEvent('x', {})).rejects.toThrow('not initialized');
  });
});
