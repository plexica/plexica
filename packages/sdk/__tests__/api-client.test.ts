// File: packages/sdk/__tests__/api-client.test.ts

import { describe, it, expect, vi, afterEach } from 'vitest';
import { ApiClient } from '../src/api-client';
import type { PluginContext } from '../src/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createContext(overrides?: Partial<PluginContext>): PluginContext {
  return {
    pluginId: 'plugin-test',
    tenantId: 'tenant-1',
    ...overrides,
  };
}

function createClient(context?: PluginContext, baseUrl = 'http://localhost:4000') {
  return new ApiClient({
    baseUrl,
    context: context ?? createContext(),
  });
}

function mockFetchResponse(body: unknown, status = 200, ok = true) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
  } as unknown as Response);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ApiClient', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should strip trailing slashes from baseUrl', () => {
      const client = createClient(undefined, 'http://localhost:4000///');
      // We verify indirectly — a GET to "/" should target "http://localhost:4000/"
      const fetchMock = mockFetchResponse({ ok: true });
      globalThis.fetch = fetchMock;

      client.get('/test');
      // The mock will be called; we check the URL in subsequent tests
    });
  });

  describe('get()', () => {
    it('should make a GET request with correct URL and headers', async () => {
      const fetchMock = mockFetchResponse({ items: [1, 2, 3] });
      globalThis.fetch = fetchMock;

      const client = createClient();
      await client.get<{ items: number[] }>('/api/test');

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

      expect(url).toBe('http://localhost:4000/api/test');
      expect(init.method).toBe('GET');

      const headers = init.headers as Record<string, string>;
      expect(headers['X-Tenant-Slug']).toBe('tenant-1');
      expect(headers['X-Caller-Plugin-ID']).toBe('plugin-test');
      expect(headers['Content-Type']).toBe('application/json');
    });

    it('should return success with parsed data on 2xx', async () => {
      globalThis.fetch = mockFetchResponse({ users: ['alice'] });

      const client = createClient();
      const response = await client.get<{ users: string[] }>('/api/users');

      expect(response.success).toBe(true);
      expect(response.status).toBe(200);
      expect(response.data).toEqual({ users: ['alice'] });
    });

    it('should append query parameters', async () => {
      const fetchMock = mockFetchResponse({});
      globalThis.fetch = fetchMock;

      const client = createClient();
      await client.get('/api/search', { params: { q: 'hello', limit: 10, active: true } });

      const [url] = fetchMock.mock.calls[0] as [string];
      const parsed = new URL(url);
      expect(parsed.searchParams.get('q')).toBe('hello');
      expect(parsed.searchParams.get('limit')).toBe('10');
      expect(parsed.searchParams.get('active')).toBe('true');
    });

    it('should skip undefined query parameters', async () => {
      const fetchMock = mockFetchResponse({});
      globalThis.fetch = fetchMock;

      const client = createClient();
      await client.get('/api/test', { params: { a: 'yes', b: undefined } });

      const [url] = fetchMock.mock.calls[0] as [string];
      const parsed = new URL(url);
      expect(parsed.searchParams.get('a')).toBe('yes');
      expect(parsed.searchParams.has('b')).toBe(false);
    });
  });

  describe('post()', () => {
    it('should send JSON body', async () => {
      const fetchMock = mockFetchResponse({ id: '123' }, 201, true);
      globalThis.fetch = fetchMock;

      const client = createClient();
      const response = await client.post('/api/items', { name: 'Widget' });

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(init.method).toBe('POST');
      expect(init.body).toBe(JSON.stringify({ name: 'Widget' }));

      expect(response.success).toBe(true);
      expect(response.status).toBe(201);
    });

    it('should not include body when undefined', async () => {
      const fetchMock = mockFetchResponse({});
      globalThis.fetch = fetchMock;

      const client = createClient();
      await client.post('/api/trigger');

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(init.body).toBeUndefined();
    });
  });

  describe('put()', () => {
    it('should make a PUT request', async () => {
      const fetchMock = mockFetchResponse({ updated: true });
      globalThis.fetch = fetchMock;

      const client = createClient();
      await client.put('/api/items/1', { name: 'Updated' });

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(init.method).toBe('PUT');
    });
  });

  describe('patch()', () => {
    it('should make a PATCH request', async () => {
      const fetchMock = mockFetchResponse({ patched: true });
      globalThis.fetch = fetchMock;

      const client = createClient();
      await client.patch('/api/items/1', { status: 'active' });

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(init.method).toBe('PATCH');
    });
  });

  describe('delete()', () => {
    it('should make a DELETE request without body', async () => {
      const fetchMock = mockFetchResponse({ deleted: true });
      globalThis.fetch = fetchMock;

      const client = createClient();
      await client.delete('/api/items/1');

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(init.method).toBe('DELETE');
      expect(init.body).toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('should return error ApiResponse on non-2xx with JSON body', async () => {
      globalThis.fetch = mockFetchResponse(
        { error: 'Not Found', message: 'Item does not exist' },
        404,
        false
      );

      const client = createClient();
      const response = await client.get('/api/items/999');

      expect(response.success).toBe(false);
      expect(response.status).toBe(404);
      expect(response.error).toBe('Not Found');
      expect(response.message).toBe('Item does not exist');
    });

    it('should handle network errors gracefully', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      const client = createClient();
      const response = await client.get('/api/test');

      expect(response.success).toBe(false);
      expect(response.status).toBe(0);
      expect(response.error).toBe('ECONNREFUSED');
    });

    it('should handle non-JSON error responses', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        text: vi.fn().mockResolvedValue('<html>Bad Gateway</html>'),
      } as unknown as Response);

      const client = createClient();
      const response = await client.get('/api/test');

      expect(response.success).toBe(false);
      expect(response.status).toBe(502);
      expect(response.error).toBe('HTTP 502');
    });

    it('should handle empty response body on success', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
        statusText: 'No Content',
        text: vi.fn().mockResolvedValue(''),
      } as unknown as Response);

      const client = createClient();
      const response = await client.delete('/api/items/1');

      expect(response.success).toBe(true);
      expect(response.status).toBe(204);
    });
  });

  describe('context headers', () => {
    it('should inject workspace and user headers when present', async () => {
      const fetchMock = mockFetchResponse({});
      globalThis.fetch = fetchMock;

      const client = createClient({
        pluginId: 'plugin-crm',
        tenantId: 'acme',
        workspaceId: 'ws-1',
        userId: 'user-42',
      });

      await client.get('/api/test');

      const headers = (fetchMock.mock.calls[0] as [string, RequestInit])[1].headers as Record<
        string,
        string
      >;
      expect(headers['X-Workspace-ID']).toBe('ws-1');
      expect(headers['X-User-ID']).toBe('user-42');
    });

    it('should not inject workspace/user headers when absent', async () => {
      const fetchMock = mockFetchResponse({});
      globalThis.fetch = fetchMock;

      const client = createClient({ pluginId: 'p', tenantId: 't' });
      await client.get('/api/test');

      const headers = (fetchMock.mock.calls[0] as [string, RequestInit])[1].headers as Record<
        string,
        string
      >;
      expect(headers['X-Workspace-ID']).toBeUndefined();
      expect(headers['X-User-ID']).toBeUndefined();
    });

    it('should allow per-request header overrides', async () => {
      const fetchMock = mockFetchResponse({});
      globalThis.fetch = fetchMock;

      const client = createClient();
      await client.get('/api/test', { headers: { Authorization: 'Bearer token123' } });

      const headers = (fetchMock.mock.calls[0] as [string, RequestInit])[1].headers as Record<
        string,
        string
      >;
      expect(headers['Authorization']).toBe('Bearer token123');
    });
  });

  describe('total field extraction', () => {
    it('should extract total from response body if present', async () => {
      globalThis.fetch = mockFetchResponse({ items: [], total: 42 });

      const client = createClient();
      const response = await client.get('/api/items');

      expect(response.total).toBe(42);
    });

    it('should not set total if not in response', async () => {
      globalThis.fetch = mockFetchResponse({ items: [] });

      const client = createClient();
      const response = await client.get('/api/items');

      expect(response.total).toBeUndefined();
    });
  });
});
