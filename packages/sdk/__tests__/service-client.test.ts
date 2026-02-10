// File: packages/sdk/__tests__/service-client.test.ts

import { describe, it, expect, vi } from 'vitest';
import { ServiceClient } from '../src/service-client';
import type { ApiClient } from '../src/api-client';
import type { PluginContext, ServiceDefinition } from '../src/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createContext(): PluginContext {
  return { pluginId: 'plugin-crm', tenantId: 'tenant-1' };
}

function createMockApiClient(): {
  api: ApiClient;
  getMock: ReturnType<typeof vi.fn>;
  postMock: ReturnType<typeof vi.fn>;
  deleteMock: ReturnType<typeof vi.fn>;
} {
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

function createServiceDef(name = 'crm.contacts'): ServiceDefinition {
  return {
    name,
    version: '1.0.0',
    baseUrl: 'http://localhost:4100',
    endpoints: [
      { method: 'GET', path: '/contacts' },
      { method: 'POST', path: '/contacts' },
    ],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ServiceClient', () => {
  describe('registerService()', () => {
    it('should POST to the register endpoint with correct body', async () => {
      const { api, postMock } = createMockApiClient();
      postMock.mockResolvedValue({ success: true, status: 201, data: { serviceId: 'svc-1' } });

      const client = new ServiceClient(api, createContext());
      const result = await client.registerService(createServiceDef());

      expect(postMock).toHaveBeenCalledWith(
        '/api/plugin-gateway/services/register',
        expect.objectContaining({
          pluginId: 'plugin-crm',
          serviceName: 'crm.contacts',
          version: '1.0.0',
          baseUrl: 'http://localhost:4100',
        })
      );
      expect(result.success).toBe(true);
      expect(result.data?.serviceId).toBe('svc-1');
    });

    it('should return error on failure', async () => {
      const { api, postMock } = createMockApiClient();
      postMock.mockResolvedValue({ success: false, status: 500, error: 'Internal error' });

      const client = new ServiceClient(api, createContext());
      const result = await client.registerService(createServiceDef());

      expect(result.success).toBe(false);
      expect(result.status).toBe(500);
    });
  });

  describe('registerServices()', () => {
    it('should register multiple services sequentially', async () => {
      const { api, postMock } = createMockApiClient();
      postMock
        .mockResolvedValueOnce({ success: true, status: 201, data: { serviceId: 'svc-1' } })
        .mockResolvedValueOnce({ success: true, status: 201, data: { serviceId: 'svc-2' } });

      const client = new ServiceClient(api, createContext());
      const result = await client.registerServices([
        createServiceDef('crm.contacts'),
        createServiceDef('crm.deals'),
      ]);

      expect(postMock).toHaveBeenCalledTimes(2);
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
    });

    it('should fail fast if any registration fails', async () => {
      const { api, postMock } = createMockApiClient();
      postMock
        .mockResolvedValueOnce({ success: true, status: 201, data: { serviceId: 'svc-1' } })
        .mockResolvedValueOnce({ success: false, status: 500, error: 'Fail', message: 'boom' });

      const client = new ServiceClient(api, createContext());
      const result = await client.registerServices([
        createServiceDef('crm.contacts'),
        createServiceDef('crm.deals'),
      ]);

      expect(result.success).toBe(false);
      expect(result.message).toContain('crm.deals');
    });
  });

  describe('deregisterService()', () => {
    it('should DELETE the correct endpoint', async () => {
      const { api, deleteMock } = createMockApiClient();
      deleteMock.mockResolvedValue({ success: true, status: 200 });

      const client = new ServiceClient(api, createContext());
      const result = await client.deregisterService('crm.contacts');

      expect(deleteMock).toHaveBeenCalledWith(
        '/api/plugin-gateway/services/plugin-crm/crm.contacts'
      );
      expect(result.success).toBe(true);
    });
  });

  describe('deregisterAllServices()', () => {
    it('should deregister all given service names', async () => {
      const { api, deleteMock } = createMockApiClient();
      deleteMock.mockResolvedValue({ success: true, status: 200 });

      const client = new ServiceClient(api, createContext());
      await client.deregisterAllServices(['crm.contacts', 'crm.deals']);

      expect(deleteMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('discoverService()', () => {
    it('should return the discovered service', async () => {
      const { api, getMock } = createMockApiClient();
      getMock.mockResolvedValue({
        success: true,
        status: 200,
        data: {
          service: {
            pluginId: 'plugin-analytics',
            name: 'analytics.events',
            version: '1.0.0',
            baseUrl: 'http://localhost:4200',
            endpoints: [],
            health: 'HEALTHY',
          },
        },
      });

      const client = new ServiceClient(api, createContext());
      const result = await client.discoverService('analytics.events');

      expect(getMock).toHaveBeenCalledWith(
        '/api/plugin-gateway/services/discover/analytics.events'
      );
      expect(result.success).toBe(true);
      expect(result.data?.pluginId).toBe('plugin-analytics');
    });

    it('should return error when service not found', async () => {
      const { api, getMock } = createMockApiClient();
      getMock.mockResolvedValue({ success: false, status: 404, error: 'Service not found' });

      const client = new ServiceClient(api, createContext());
      const result = await client.discoverService('nonexistent');

      expect(result.success).toBe(false);
      expect(result.status).toBe(404);
    });
  });

  describe('listServices()', () => {
    it('should list all services', async () => {
      const { api, getMock } = createMockApiClient();
      getMock.mockResolvedValue({
        success: true,
        status: 200,
        data: { services: [{ name: 'svc-1' }], count: 1 },
      });

      const client = new ServiceClient(api, createContext());
      const result = await client.listServices();

      expect(getMock).toHaveBeenCalledWith('/api/plugin-gateway/services', { params: {} });
      expect(result.success).toBe(true);
      expect(result.total).toBe(1);
    });

    it('should pass filter params', async () => {
      const { api, getMock } = createMockApiClient();
      getMock.mockResolvedValue({
        success: true,
        status: 200,
        data: { services: [], count: 0 },
      });

      const client = new ServiceClient(api, createContext());
      await client.listServices({ pluginId: 'plugin-crm', status: 'ACTIVE' });

      expect(getMock).toHaveBeenCalledWith('/api/plugin-gateway/services', {
        params: { pluginId: 'plugin-crm', status: 'ACTIVE' },
      });
    });
  });

  describe('heartbeat()', () => {
    it('should POST heartbeat', async () => {
      const { api, postMock } = createMockApiClient();
      postMock.mockResolvedValue({ success: true, status: 200 });

      const client = new ServiceClient(api, createContext());
      const result = await client.heartbeat('svc-123');

      expect(postMock).toHaveBeenCalledWith('/api/plugin-gateway/services/svc-123/heartbeat');
      expect(result.success).toBe(true);
    });
  });

  describe('callPluginApi()', () => {
    it('should POST to the call endpoint with correct body', async () => {
      const { api, postMock } = createMockApiClient();
      postMock.mockResolvedValue({ success: true, status: 200, data: { contacts: [] } });

      const client = new ServiceClient(api, createContext());
      const result = await client.callPluginApi({
        targetPluginId: 'plugin-analytics',
        serviceName: 'analytics.events',
        method: 'GET',
        path: '/events',
        params: { limit: 10 },
      });

      expect(postMock).toHaveBeenCalledWith(
        '/api/plugin-gateway/call',
        expect.objectContaining({
          callerPluginId: 'plugin-crm',
          targetPluginId: 'plugin-analytics',
          targetServiceName: 'analytics.events',
          method: 'GET',
          path: '/events',
          query: { limit: 10 },
        })
      );
      expect(result.success).toBe(true);
    });
  });
});
