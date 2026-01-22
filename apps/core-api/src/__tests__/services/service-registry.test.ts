/**
 * Service Registry Tests (M2.3 Task 11)
 *
 * Unit tests for the Service Registry service
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ServiceRegistryService } from '../../services/service-registry.service.js';
import type { Redis } from 'ioredis';

// ServiceStatus enum from Prisma
enum ServiceStatus {
  HEALTHY = 'HEALTHY',
  DEGRADED = 'DEGRADED',
  UNAVAILABLE = 'UNAVAILABLE',
}

// Mock Prisma and Redis
const createMockPrisma = () => {
  const services = new Map<string, any>();
  const endpoints = new Map<string, any[]>();

  return {
    pluginService: {
      upsert: vi.fn(async ({ where, create, update }) => {
        const existing = Array.from(services.values()).find(
          (s) =>
            s.tenantId === where.tenantId_pluginId_serviceName.tenantId &&
            s.pluginId === where.tenantId_pluginId_serviceName.pluginId &&
            s.serviceName === where.tenantId_pluginId_serviceName.serviceName
        );

        if (existing) {
          Object.assign(existing, update);
          return existing;
        } else {
          const service = { ...create, id: `service-${services.size + 1}` };
          services.set(service.id, service);
          return service;
        }
      }),
      findFirst: vi.fn(async ({ where, include }) => {
        const results = Array.from(services.values()).filter((s) => {
          if (where.tenantId && s.tenantId !== where.tenantId) return false;
          if (where.serviceName && s.serviceName !== where.serviceName) return false;
          if (where.status?.in && !where.status.in.includes(s.status)) return false;
          return true;
        });

        if (results.length === 0) return null;

        const service = results[0];
        if (include?.endpoints) {
          const serviceEndpoints = endpoints.get(service.id) || [];
          return { ...service, endpoints: serviceEndpoints };
        }
        return service;
      }),
      findMany: vi.fn(async ({ where, include }) => {
        const results = Array.from(services.values());
        const filtered = results.filter((s) => {
          if (where.pluginId && s.pluginId !== where.pluginId) return false;
          if (where.tenantId && s.tenantId !== where.tenantId) return false;
          if (where.serviceName && s.serviceName !== where.serviceName) return false;
          if (where.status && s.status !== where.status) return false;
          return true;
        });

        if (include?.endpoints) {
          return filtered.map((s) => ({
            ...s,
            endpoints: endpoints.get(s.id) || [],
          }));
        }
        return filtered;
      }),
      findUnique: vi.fn(async ({ where, select }) => {
        if (where.id) {
          const service = services.get(where.id) || null;
          if (select && service) {
            const result: any = {};
            if (select.tenantId) result.tenantId = service.tenantId;
            if (select.serviceName) result.serviceName = service.serviceName;
            return result;
          }
          return service;
        }
        if (where.tenantId_pluginId_serviceName) {
          const { tenantId, pluginId, serviceName } = where.tenantId_pluginId_serviceName;
          return (
            Array.from(services.values()).find(
              (s) =>
                s.tenantId === tenantId && s.pluginId === pluginId && s.serviceName === serviceName
            ) || null
          );
        }
        return null;
      }),
      update: vi.fn(async ({ where, data }) => {
        const service = services.get(where.id);
        if (!service) throw new Error('Service not found');
        Object.assign(service, data);
        return service;
      }),
      updateMany: vi.fn(async ({ where, data }) => {
        let count = 0;
        Array.from(services.values()).forEach((s) => {
          if (where.tenantId && s.tenantId !== where.tenantId) return;
          if (where.pluginId && s.pluginId !== where.pluginId) return;
          if (where.serviceName && s.serviceName !== where.serviceName) return;
          Object.assign(s, data);
          count++;
        });
        return { count };
      }),
      deleteMany: vi.fn(async ({ where }) => {
        let count = 0;
        Array.from(services.entries()).forEach(([id, s]) => {
          if (where.tenantId && s.tenantId !== where.tenantId) return;
          if (where.pluginId && s.pluginId !== where.pluginId) return;
          if (where.serviceName && s.serviceName !== where.serviceName) return;
          services.delete(id);
          count++;
        });
        return { count };
      }),
    },
    pluginServiceEndpoint: {
      createMany: vi.fn(async ({ data }) => {
        const serviceId = data[0]?.serviceId;
        if (!endpoints.has(serviceId)) {
          endpoints.set(serviceId, []);
        }
        endpoints.get(serviceId)!.push(...data);
        return { count: data.length };
      }),
      deleteMany: vi.fn(async ({ where }) => {
        if (where.serviceId) {
          endpoints.delete(where.serviceId);
        }
        return { count: 0 };
      }),
    },
    $transaction: vi.fn(async (callback) => {
      return await callback(mockPrisma);
    }),
  } as any;
};

const createMockRedis = () => {
  const cache = new Map<string, string>();

  return {
    get: vi.fn(async (key: string) => cache.get(key) || null),
    setex: vi.fn(async (key: string, _ttl: number, value: string) => {
      cache.set(key, value);
      return 'OK';
    }),
    del: vi.fn(async (key: string) => {
      cache.delete(key);
      return 1;
    }),
    keys: vi.fn(async (pattern: string) => {
      return Array.from(cache.keys()).filter((k) => k.includes(pattern.replace('*', '')));
    }),
  } as unknown as Redis;
};

const createMockLogger = () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
});

let mockPrisma: any;
let mockRedis: Redis;
let mockLogger: any;
let serviceRegistry: ServiceRegistryService;

describe('ServiceRegistryService', () => {
  beforeEach(() => {
    mockPrisma = createMockPrisma();
    mockRedis = createMockRedis();
    mockLogger = createMockLogger();
    serviceRegistry = new ServiceRegistryService(mockPrisma, mockRedis, mockLogger);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('registerService', () => {
    it('should register a new service successfully', async () => {
      const registration = {
        pluginId: 'plugin-crm',
        tenantId: 'tenant-1',
        serviceName: 'crm.contacts',
        version: '1.0.0',
        baseUrl: 'http://localhost:3100',
        endpoints: [
          { method: 'GET' as const, path: '/contacts' },
          { method: 'POST' as const, path: '/contacts' },
        ],
      };

      const serviceId = await serviceRegistry.registerService(registration);

      expect(serviceId).toBeDefined();
      expect(serviceId).toMatch(/^service-/);
      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('should register endpoints if provided', async () => {
      const registration = {
        pluginId: 'plugin-crm',
        tenantId: 'tenant-1',
        serviceName: 'crm.contacts',
        version: '1.0.0',
        endpoints: [
          { method: 'GET' as const, path: '/contacts', description: 'List contacts' },
          { method: 'POST' as const, path: '/contacts', description: 'Create contact' },
        ],
      };

      await serviceRegistry.registerService(registration);

      expect(mockPrisma.pluginServiceEndpoint.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ method: 'GET', path: '/contacts' }),
            expect.objectContaining({ method: 'POST', path: '/contacts' }),
          ]),
        })
      );
    });

    it('should invalidate cache when registering', async () => {
      const registration = {
        pluginId: 'plugin-crm',
        tenantId: 'tenant-1',
        serviceName: 'crm.contacts',
        version: '1.0.0',
      };

      await serviceRegistry.registerService(registration);

      // registerService invalidates cache (calls del, not setex)
      expect(mockRedis.del).toHaveBeenCalled();
    });
  });

  describe('discoverService', () => {
    beforeEach(async () => {
      // Pre-register a service
      await serviceRegistry.registerService({
        pluginId: 'plugin-crm',
        tenantId: 'tenant-1',
        serviceName: 'crm.contacts',
        version: '1.0.0',
        baseUrl: 'http://localhost:3100',
      });
    });

    it('should discover a registered service', async () => {
      const service = await serviceRegistry.discoverService('tenant-1', 'crm.contacts');

      expect(service).toBeDefined();
      expect(service?.serviceName).toBe('crm.contacts');
      expect(service?.pluginId).toBe('plugin-crm');
      expect(service?.baseUrl).toBe('http://localhost:3100');
    });

    it('should return null for non-existent service', async () => {
      const service = await serviceRegistry.discoverService('tenant-1', 'non-existent');

      expect(service).toBeNull();
    });

    it('should use cache on subsequent calls', async () => {
      // First call - hits database
      await serviceRegistry.discoverService('tenant-1', 'crm.contacts');

      // Clear the mock to see if second call uses cache
      vi.clearAllMocks();

      // Second call - should use cache
      await serviceRegistry.discoverService('tenant-1', 'crm.contacts');

      expect(mockRedis.get).toHaveBeenCalled();
    });
  });

  describe('listServices', () => {
    beforeEach(async () => {
      await serviceRegistry.registerService({
        pluginId: 'plugin-crm',
        tenantId: 'tenant-1',
        serviceName: 'crm.contacts',
        version: '1.0.0',
      });
      await serviceRegistry.registerService({
        pluginId: 'plugin-crm',
        tenantId: 'tenant-1',
        serviceName: 'crm.deals',
        version: '1.0.0',
      });
      await serviceRegistry.registerService({
        pluginId: 'plugin-analytics',
        tenantId: 'tenant-1',
        serviceName: 'analytics.reports',
        version: '1.0.0',
      });
    });

    it('should list all services for a tenant', async () => {
      const services = await serviceRegistry.listServices('tenant-1');

      expect(services).toHaveLength(3);
      expect(services.map((s) => s.serviceName)).toContain('crm.contacts');
      expect(services.map((s) => s.serviceName)).toContain('crm.deals');
      expect(services.map((s) => s.serviceName)).toContain('analytics.reports');
    });

    it('should filter services by plugin ID', async () => {
      const services = await serviceRegistry.listServices('tenant-1', { pluginId: 'plugin-crm' });

      expect(services).toHaveLength(2);
      expect(services.every((s) => s.pluginId === 'plugin-crm')).toBe(true);
    });

    it('should return empty array for tenant with no services', async () => {
      const services = await serviceRegistry.listServices('tenant-2');

      expect(services).toHaveLength(0);
    });
  });

  describe('deregisterService', () => {
    beforeEach(async () => {
      await serviceRegistry.registerService({
        pluginId: 'plugin-crm',
        tenantId: 'tenant-1',
        serviceName: 'crm.contacts',
        version: '1.0.0',
      });
    });

    it('should deregister a service successfully', async () => {
      await serviceRegistry.deregisterService('tenant-1', 'plugin-crm', 'crm.contacts');

      const services = await serviceRegistry.listServices('tenant-1');
      expect(services).toHaveLength(0);
    });

    it('should clear cache when deregistering', async () => {
      await serviceRegistry.deregisterService('tenant-1', 'plugin-crm', 'crm.contacts');

      expect(mockRedis.del).toHaveBeenCalled();
    });
  });

  describe('updateServiceHealth', () => {
    let serviceId: string;

    beforeEach(async () => {
      serviceId = await serviceRegistry.registerService({
        pluginId: 'plugin-crm',
        tenantId: 'tenant-1',
        serviceName: 'crm.contacts',
        version: '1.0.0',
      });
    });

    it('should update service to healthy status', async () => {
      await serviceRegistry.updateServiceHealth(serviceId, ServiceStatus.HEALTHY);

      const service = await serviceRegistry.discoverService('tenant-1', 'crm.contacts');
      expect(service?.status).toBe(ServiceStatus.HEALTHY);
    });

    it('should update service to degraded status', async () => {
      await serviceRegistry.updateServiceHealth(serviceId, ServiceStatus.DEGRADED);

      const service = await serviceRegistry.discoverService('tenant-1', 'crm.contacts');
      expect(service?.status).toBe(ServiceStatus.DEGRADED);
    });

    it('should invalidate cache after health update', async () => {
      await serviceRegistry.updateServiceHealth(serviceId, ServiceStatus.HEALTHY);

      expect(mockRedis.del).toHaveBeenCalled();
    });
  });
});
