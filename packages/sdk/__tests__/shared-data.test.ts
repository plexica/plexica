// File: packages/sdk/__tests__/shared-data.test.ts

import { describe, it, expect, vi } from 'vitest';
import { SharedDataClient } from '../src/shared-data';
import type { ApiClient } from '../src/api-client';
import type { PluginContext } from '../src/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createContext(): PluginContext {
  return { pluginId: 'plugin-crm', tenantId: 'tenant-1' };
}

function createMockApiClient() {
  const getMock = vi.fn();
  const postMock = vi.fn();
  const deleteMock = vi.fn();

  const api = {
    get: getMock,
    post: postMock,
    put: vi.fn(),
    patch: vi.fn(),
    delete: deleteMock,
    request: vi.fn(),
  } as unknown as ApiClient;

  return { api, getMock, postMock, deleteMock };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SharedDataClient', () => {
  describe('set()', () => {
    it('should POST with namespace, key, value, and ownerId', async () => {
      const { api, postMock } = createMockApiClient();
      postMock.mockResolvedValue({ success: true, status: 201 });

      const client = new SharedDataClient(api, createContext());
      const result = await client.set('config', { theme: 'dark' });

      expect(postMock).toHaveBeenCalledWith('/api/plugin-gateway/shared-data', {
        namespace: 'plugin-crm',
        key: 'config',
        value: { theme: 'dark' },
        ownerId: 'plugin-crm',
      });
      expect(result.success).toBe(true);
    });

    it('should include TTL when provided', async () => {
      const { api, postMock } = createMockApiClient();
      postMock.mockResolvedValue({ success: true, status: 201 });

      const client = new SharedDataClient(api, createContext());
      await client.set('cache-key', 'value', { ttl: 3600 });

      expect(postMock).toHaveBeenCalledWith('/api/plugin-gateway/shared-data', {
        namespace: 'plugin-crm',
        key: 'cache-key',
        value: 'value',
        ownerId: 'plugin-crm',
        ttl: 3600,
      });
    });

    it('should return error on failure', async () => {
      const { api, postMock } = createMockApiClient();
      postMock.mockResolvedValue({ success: false, status: 500, error: 'DB error' });

      const client = new SharedDataClient(api, createContext());
      const result = await client.set('key', 'val');

      expect(result.success).toBe(false);
      expect(result.error).toBe('DB error');
    });
  });

  describe('get()', () => {
    it('should GET the correct path and return the value', async () => {
      const { api, getMock } = createMockApiClient();
      getMock.mockResolvedValue({
        success: true,
        status: 200,
        data: { namespace: 'plugin-crm', key: 'config', value: { theme: 'dark' } },
      });

      const client = new SharedDataClient(api, createContext());
      const result = await client.get<{ theme: string }>('config');

      expect(getMock).toHaveBeenCalledWith('/api/plugin-gateway/shared-data/plugin-crm/config');
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ theme: 'dark' });
    });

    it('should handle 404 (key not found)', async () => {
      const { api, getMock } = createMockApiClient();
      getMock.mockResolvedValue({ success: false, status: 404, error: 'Data not found' });

      const client = new SharedDataClient(api, createContext());
      const result = await client.get('missing');

      expect(result.success).toBe(false);
      expect(result.status).toBe(404);
    });
  });

  describe('getFromNamespace()', () => {
    it('should read from another plugin namespace', async () => {
      const { api, getMock } = createMockApiClient();
      getMock.mockResolvedValue({
        success: true,
        status: 200,
        data: { namespace: 'plugin-analytics', key: 'stats', value: { count: 99 } },
      });

      const client = new SharedDataClient(api, createContext());
      const result = await client.getFromNamespace<{ count: number }>('plugin-analytics', 'stats');

      expect(getMock).toHaveBeenCalledWith(
        '/api/plugin-gateway/shared-data/plugin-analytics/stats'
      );
      expect(result.success).toBe(true);
      expect(result.data?.count).toBe(99);
    });
  });

  describe('delete()', () => {
    it('should DELETE the correct path', async () => {
      const { api, deleteMock } = createMockApiClient();
      deleteMock.mockResolvedValue({ success: true, status: 200 });

      const client = new SharedDataClient(api, createContext());
      const result = await client.delete('old-key');

      expect(deleteMock).toHaveBeenCalledWith('/api/plugin-gateway/shared-data/plugin-crm/old-key');
      expect(result.success).toBe(true);
    });

    it('should handle 404 on delete', async () => {
      const { api, deleteMock } = createMockApiClient();
      deleteMock.mockResolvedValue({ success: false, status: 404, error: 'Data not found' });

      const client = new SharedDataClient(api, createContext());
      const result = await client.delete('missing');

      expect(result.success).toBe(false);
      expect(result.status).toBe(404);
    });
  });

  describe('listKeys()', () => {
    it('should return keys from own namespace', async () => {
      const { api, getMock } = createMockApiClient();
      getMock.mockResolvedValue({
        success: true,
        status: 200,
        data: { namespace: 'plugin-crm', keys: ['config', 'cache'], count: 2 },
      });

      const client = new SharedDataClient(api, createContext());
      const result = await client.listKeys();

      expect(getMock).toHaveBeenCalledWith('/api/plugin-gateway/shared-data/plugin-crm');
      expect(result.success).toBe(true);
      expect(result.data).toEqual(['config', 'cache']);
      expect(result.total).toBe(2);
    });
  });

  describe('listKeysFromNamespace()', () => {
    it('should list keys from another namespace', async () => {
      const { api, getMock } = createMockApiClient();
      getMock.mockResolvedValue({
        success: true,
        status: 200,
        data: { namespace: 'plugin-analytics', keys: ['metrics'], count: 1 },
      });

      const client = new SharedDataClient(api, createContext());
      const result = await client.listKeysFromNamespace('plugin-analytics');

      expect(getMock).toHaveBeenCalledWith('/api/plugin-gateway/shared-data/plugin-analytics');
      expect(result.data).toEqual(['metrics']);
    });
  });
});
