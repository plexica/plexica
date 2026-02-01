/**
 * Plugin API Gateway Service Tests (M2.3 Task 11)
 *
 * Unit tests for the Plugin API Gateway service
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  PluginApiGateway,
  PluginGatewayError,
} from '../../../services/plugin-api-gateway.service.js';
import type {
  ServiceRegistryService,
  DiscoveredService,
} from '../../../services/service-registry.service.js';

// Mock axios
const mockHttpClient = {
  request: vi.fn(),
};

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => mockHttpClient),
    isAxiosError: (error: any) => error && error.isAxiosError === true,
  },
  isAxiosError: (error: any) => error && error.isAxiosError === true,
}));

// Create mock Service Registry
const createMockServiceRegistry = () => {
  const services = new Map<string, DiscoveredService>();

  return {
    discoverService: vi.fn(async (_tenantId: string, serviceName: string) => {
      return services.get(serviceName) || null;
    }),
    __addService: (service: DiscoveredService) => {
      services.set(service.serviceName, service);
    },
    __clearServices: () => {
      services.clear();
    },
  } as any as ServiceRegistryService & {
    __addService: (service: DiscoveredService) => void;
    __clearServices: () => void;
  };
};

const createMockLogger = () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
});

let mockServiceRegistry: ReturnType<typeof createMockServiceRegistry>;
let mockLogger: any;
let apiGateway: PluginApiGateway;

describe('PluginApiGateway', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHttpClient.request.mockReset();

    mockServiceRegistry = createMockServiceRegistry();
    mockLogger = createMockLogger();
    apiGateway = new PluginApiGateway(mockServiceRegistry, mockLogger);
  });

  afterEach(() => {
    mockServiceRegistry.__clearServices();
  });

  describe('callPluginApi', () => {
    const setupCrmService = () => {
      const service: DiscoveredService = {
        id: 'service-1',
        pluginId: 'plugin-crm',
        serviceName: 'crm.contacts',
        version: '1.0.0',
        baseUrl: 'http://localhost:3100',
        status: 'HEALTHY' as any,
        endpoints: [
          { method: 'GET', path: '/contacts', description: 'List contacts' },
          { method: 'POST', path: '/contacts', description: 'Create contact' },
          { method: 'GET', path: '/contacts/:id', description: 'Get contact' },
          { method: 'PUT', path: '/contacts/:id', description: 'Update contact' },
          { method: 'DELETE', path: '/contacts/:id', description: 'Delete contact' },
        ],
        metadata: {},
        lastSeenAt: new Date(),
      };

      mockServiceRegistry.__addService(service);
      return service;
    };

    it('should successfully call a plugin API', async () => {
      setupCrmService();

      mockHttpClient.request.mockResolvedValue({
        status: 200,
        headers: { 'content-type': 'application/json' },
        data: { contacts: [] },
      });

      const result = await apiGateway.callPluginApi('plugin-analytics', 'tenant-1', {
        targetPluginId: 'plugin-crm',
        targetServiceName: 'crm.contacts',
        method: 'GET',
        path: '/contacts',
      });

      expect(result.status).toBe(200);
      expect(result.data).toEqual({ contacts: [] });
      expect(result.metadata.targetPlugin).toBe('plugin-crm');
      expect(result.metadata.targetService).toBe('crm.contacts');
      expect(result.metadata.duration).toBeGreaterThanOrEqual(0);
    });

    it('should include tenant and caller info in headers', async () => {
      setupCrmService();

      mockHttpClient.request.mockResolvedValue({
        status: 200,
        headers: {},
        data: {},
      });

      await apiGateway.callPluginApi('plugin-analytics', 'tenant-1', {
        targetPluginId: 'plugin-crm',
        targetServiceName: 'crm.contacts',
        method: 'GET',
        path: '/contacts',
      });

      expect(mockHttpClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Tenant-ID': 'tenant-1',
            'X-Caller-Plugin-ID': 'plugin-analytics',
            'X-Request-ID': expect.stringMatching(/^req_/),
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should pass request body for POST requests', async () => {
      setupCrmService();

      mockHttpClient.request.mockResolvedValue({
        status: 201,
        headers: {},
        data: { id: '123', name: 'John Doe' },
      });

      const requestBody = { name: 'John Doe', email: 'john@example.com' };

      await apiGateway.callPluginApi('plugin-analytics', 'tenant-1', {
        targetPluginId: 'plugin-crm',
        targetServiceName: 'crm.contacts',
        method: 'POST',
        path: '/contacts',
        body: requestBody,
      });

      expect(mockHttpClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          data: requestBody,
        })
      );
    });

    it('should append query parameters to URL', async () => {
      setupCrmService();

      mockHttpClient.request.mockResolvedValue({
        status: 200,
        headers: {},
        data: { contacts: [] },
      });

      await apiGateway.callPluginApi('plugin-analytics', 'tenant-1', {
        targetPluginId: 'plugin-crm',
        targetServiceName: 'crm.contacts',
        method: 'GET',
        path: '/contacts',
        query: { limit: '10', offset: '0' },
      });

      expect(mockHttpClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('limit=10'),
        })
      );
    });

    it('should match endpoints with path parameters', async () => {
      setupCrmService();

      mockHttpClient.request.mockResolvedValue({
        status: 200,
        headers: {},
        data: { id: '123', name: 'John Doe' },
      });

      const result = await apiGateway.callPluginApi('plugin-analytics', 'tenant-1', {
        targetPluginId: 'plugin-crm',
        targetServiceName: 'crm.contacts',
        method: 'GET',
        path: '/contacts/123', // Should match /contacts/:id
      });

      expect(result.status).toBe(200);
      expect(mockHttpClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('/contacts/123'),
        })
      );
    });

    it('should throw error when service not found', async () => {
      // Don't add any service

      await expect(
        apiGateway.callPluginApi('plugin-analytics', 'tenant-1', {
          targetPluginId: 'plugin-crm',
          targetServiceName: 'crm.contacts',
          method: 'GET',
          path: '/contacts',
        })
      ).rejects.toThrow(PluginGatewayError);

      await expect(
        apiGateway.callPluginApi('plugin-analytics', 'tenant-1', {
          targetPluginId: 'plugin-crm',
          targetServiceName: 'crm.contacts',
          method: 'GET',
          path: '/contacts',
        })
      ).rejects.toThrow('Service not found');
    });

    it('should throw error when plugin ID mismatch', async () => {
      setupCrmService();

      await expect(
        apiGateway.callPluginApi('plugin-analytics', 'tenant-1', {
          targetPluginId: 'plugin-wrong', // Wrong plugin ID
          targetServiceName: 'crm.contacts',
          method: 'GET',
          path: '/contacts',
        })
      ).rejects.toThrow(PluginGatewayError);

      await expect(
        apiGateway.callPluginApi('plugin-analytics', 'tenant-1', {
          targetPluginId: 'plugin-wrong',
          targetServiceName: 'crm.contacts',
          method: 'GET',
          path: '/contacts',
        })
      ).rejects.toThrow('belongs to plugin-crm');
    });

    it('should throw error when service is unavailable', async () => {
      const service = setupCrmService();
      service.status = 'UNAVAILABLE' as any;

      await expect(
        apiGateway.callPluginApi('plugin-analytics', 'tenant-1', {
          targetPluginId: 'plugin-crm',
          targetServiceName: 'crm.contacts',
          method: 'GET',
          path: '/contacts',
        })
      ).rejects.toThrow(PluginGatewayError);

      await expect(
        apiGateway.callPluginApi('plugin-analytics', 'tenant-1', {
          targetPluginId: 'plugin-crm',
          targetServiceName: 'crm.contacts',
          method: 'GET',
          path: '/contacts',
        })
      ).rejects.toThrow('is unavailable');
    });

    it('should throw error when endpoint not found', async () => {
      setupCrmService();

      await expect(
        apiGateway.callPluginApi('plugin-analytics', 'tenant-1', {
          targetPluginId: 'plugin-crm',
          targetServiceName: 'crm.contacts',
          method: 'GET',
          path: '/invalid-endpoint',
        })
      ).rejects.toThrow(PluginGatewayError);

      try {
        await apiGateway.callPluginApi('plugin-analytics', 'tenant-1', {
          targetPluginId: 'plugin-crm',
          targetServiceName: 'crm.contacts',
          method: 'GET',
          path: '/invalid-endpoint',
        });
      } catch (error) {
        expect(error).toBeInstanceOf(PluginGatewayError);
        expect((error as PluginGatewayError).code).toBe('ENDPOINT_NOT_FOUND');
        expect((error as PluginGatewayError).details).toHaveProperty('availableEndpoints');
      }
    });

    it('should handle HTTP errors gracefully', async () => {
      setupCrmService();

      const axiosError = new Error('Network Error');
      Object.assign(axiosError, {
        isAxiosError: true,
        code: 'ECONNREFUSED',
        response: {
          status: 500,
          data: { error: 'Internal Server Error' },
        },
      });

      mockHttpClient.request.mockRejectedValue(axiosError);

      await expect(
        apiGateway.callPluginApi('plugin-analytics', 'tenant-1', {
          targetPluginId: 'plugin-crm',
          targetServiceName: 'crm.contacts',
          method: 'GET',
          path: '/contacts',
        })
      ).rejects.toThrow(PluginGatewayError);
    });

    it('should accept DEGRADED service status', async () => {
      const service = setupCrmService();
      service.status = 'DEGRADED' as any;

      mockHttpClient.request.mockResolvedValue({
        status: 200,
        headers: {},
        data: { contacts: [] },
      });

      const result = await apiGateway.callPluginApi('plugin-analytics', 'tenant-1', {
        targetPluginId: 'plugin-crm',
        targetServiceName: 'crm.contacts',
        method: 'GET',
        path: '/contacts',
      });

      expect(result.status).toBe(200);
    });

    it('should pass custom headers', async () => {
      setupCrmService();

      mockHttpClient.request.mockResolvedValue({
        status: 200,
        headers: {},
        data: {},
      });

      await apiGateway.callPluginApi('plugin-analytics', 'tenant-1', {
        targetPluginId: 'plugin-crm',
        targetServiceName: 'crm.contacts',
        method: 'GET',
        path: '/contacts',
        headers: {
          'X-Custom-Header': 'custom-value',
          Authorization: 'Bearer token123',
        },
      });

      expect(mockHttpClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Custom-Header': 'custom-value',
            Authorization: 'Bearer token123',
          }),
        })
      );
    });

    it('should include response metadata', async () => {
      setupCrmService();

      const beforeCall = Date.now();

      mockHttpClient.request.mockResolvedValue({
        status: 200,
        headers: { 'x-custom': 'value' },
        data: { result: 'success' },
      });

      const result = await apiGateway.callPluginApi('plugin-analytics', 'tenant-1', {
        targetPluginId: 'plugin-crm',
        targetServiceName: 'crm.contacts',
        method: 'GET',
        path: '/contacts',
      });

      expect(result.metadata).toEqual({
        targetPlugin: 'plugin-crm',
        targetService: 'crm.contacts',
        duration: expect.any(Number),
        timestamp: expect.any(Date),
      });

      expect(result.metadata.timestamp.getTime()).toBeGreaterThanOrEqual(beforeCall);
      expect(result.metadata.duration).toBeGreaterThanOrEqual(0);
    });

    it('should use baseUrl from service if provided', async () => {
      setupCrmService();

      mockHttpClient.request.mockResolvedValue({
        status: 200,
        headers: {},
        data: {},
      });

      await apiGateway.callPluginApi('plugin-analytics', 'tenant-1', {
        targetPluginId: 'plugin-crm',
        targetServiceName: 'crm.contacts',
        method: 'GET',
        path: '/contacts',
      });

      expect(mockHttpClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('http://localhost:3100'),
        })
      );
    });

    it('should handle different HTTP methods', async () => {
      setupCrmService();

      mockHttpClient.request.mockResolvedValue({
        status: 200,
        headers: {},
        data: {},
      });

      const testCases = [
        { method: 'GET' as const, path: '/contacts' },
        { method: 'POST' as const, path: '/contacts', body: { data: 'test' } },
        { method: 'PUT' as const, path: '/contacts/123', body: { data: 'test' } },
        { method: 'DELETE' as const, path: '/contacts/123' },
      ];

      for (const testCase of testCases) {
        await apiGateway.callPluginApi('plugin-analytics', 'tenant-1', {
          targetPluginId: 'plugin-crm',
          targetServiceName: 'crm.contacts',
          method: testCase.method,
          path: testCase.path,
          body: testCase.body,
        });

        expect(mockHttpClient.request).toHaveBeenCalledWith(
          expect.objectContaining({
            method: testCase.method,
          })
        );
      }
    });

    it('should log API calls', async () => {
      setupCrmService();

      mockHttpClient.request.mockResolvedValue({
        status: 200,
        headers: {},
        data: {},
      });

      await apiGateway.callPluginApi('plugin-analytics', 'tenant-1', {
        targetPluginId: 'plugin-crm',
        targetServiceName: 'crm.contacts',
        method: 'GET',
        path: '/contacts',
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          caller: 'plugin-analytics',
          target: 'plugin-crm',
          service: 'crm.contacts',
        }),
        'Plugin API call initiated'
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 200,
          target: 'plugin-crm',
        }),
        'Plugin API call completed'
      );
    });
  });

  describe('PluginGatewayError', () => {
    it('should create error with correct properties', () => {
      const error = new PluginGatewayError('Test error', 'TEST_CODE', 400, { foo: 'bar' });

      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_CODE');
      expect(error.statusCode).toBe(400);
      expect(error.details).toEqual({ foo: 'bar' });
      expect(error.name).toBe('PluginGatewayError');
    });

    it('should default to status 500', () => {
      const error = new PluginGatewayError('Test error', 'TEST_CODE');

      expect(error.statusCode).toBe(500);
    });
  });
});
