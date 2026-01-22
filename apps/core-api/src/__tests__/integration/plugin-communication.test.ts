/**
 * Plugin-to-Plugin Communication Integration Tests (M2.3 Task 11)
 *
 * End-to-end integration tests for the complete plugin communication flow
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ServiceRegistryService } from '../../services/service-registry.service.js';
import { DependencyResolutionService } from '../../services/dependency-resolution.service.js';
import { SharedDataService } from '../../services/shared-data.service.js';
import { validatePluginManifest } from '../../schemas/plugin-manifest.schema.js';

// Mock logger
const createMockLogger = () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
});

// Mock Prisma
const createMockPrisma = () => {
  const services = new Map<string, any>();
  const dependencies = new Map<string, any>();
  const sharedData = new Map<string, any>();
  const plugins = new Map<string, any>();
  const tenantPlugins = new Map<string, any>();

  return {
    pluginService: {
      upsert: vi.fn(async ({ where, create, update }) => {
        const key = `${where.tenantId_pluginId_serviceName.tenantId}-${where.tenantId_pluginId_serviceName.pluginId}-${where.tenantId_pluginId_serviceName.serviceName}`;
        const existing = services.get(key);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        } else {
          const service = { ...create, id: `service-${services.size + 1}` };
          services.set(key, service);
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
          return { ...service, endpoints: [] };
        }
        return service;
      }),
      findMany: vi.fn(async ({ where, include }) => {
        const results = Array.from(services.values()).filter((s) => {
          if (where.tenantId && s.tenantId !== where.tenantId) return false;
          if (where.pluginId && s.pluginId !== where.pluginId) return false;
          return true;
        });
        if (include?.endpoints) {
          return results.map((s) => ({ ...s, endpoints: [] }));
        }
        return results;
      }),
      findUnique: vi.fn(async ({ where, select }) => {
        // Find service by id (need to search all services)
        let service: any = null;
        for (const s of services.values()) {
          if (s.id === where.id) {
            service = s;
            break;
          }
        }
        if (!service) return null;
        if (select) {
          const result: any = {};
          if (select.tenantId) result.tenantId = service.tenantId;
          if (select.serviceName) result.serviceName = service.serviceName;
          return result;
        }
        return service;
      }),
      update: vi.fn(async ({ where, data }) => {
        // Find service by id (need to search all services)
        let foundService: any = null;
        for (const service of services.values()) {
          if (service.id === where.id) {
            foundService = service;
            break;
          }
        }
        if (!foundService) throw new Error('Service not found');
        Object.assign(foundService, data);
        return foundService;
      }),
      deleteMany: vi.fn(async ({ where }) => {
        let count = 0;
        Array.from(services.entries()).forEach(([key, s]) => {
          if (where.tenantId && s.tenantId !== where.tenantId) return;
          if (where.pluginId && s.pluginId !== where.pluginId) return;
          if (where.serviceName && s.serviceName !== where.serviceName) return;
          services.delete(key);
          count++;
        });
        return { count };
      }),
    },
    pluginServiceEndpoint: {
      createMany: vi.fn(async () => ({ count: 0 })),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    pluginDependency: {
      createMany: vi.fn(async ({ data }) => {
        data.forEach((dep: any) => {
          const key = `${dep.pluginId}-${dep.dependsOnPluginId}`;
          dependencies.set(key, { ...dep, id: key });
        });
        return { count: data.length };
      }),
      deleteMany: vi.fn(async ({ where }) => {
        let count = 0;
        if (where.pluginId?.in) {
          Array.from(dependencies.entries()).forEach(([key, dep]) => {
            if (where.pluginId.in.includes(dep.pluginId)) {
              dependencies.delete(key);
              count++;
            }
          });
        }
        return { count };
      }),
      findMany: vi.fn(async ({ where }) => {
        return Array.from(dependencies.values()).filter((dep) => {
          if (where.pluginId && dep.pluginId !== where.pluginId) return false;
          if (where.dependsOnPluginId && dep.dependsOnPluginId !== where.dependsOnPluginId)
            return false;
          return true;
        });
      }),
    },
    plugin: {
      findUnique: vi.fn(async ({ where }) => plugins.get(where.id) || null),
    },
    tenantPlugin: {
      findMany: vi.fn(async ({ where, include }) => {
        const results = Array.from(tenantPlugins.values()).filter(
          (tp: any) => tp.tenantId === where.tenantId
        );
        if (include?.plugin) {
          return results.map((tp: any) => ({
            ...tp,
            plugin: plugins.get(tp.pluginId),
          }));
        }
        return results;
      }),
    },
    sharedPluginData: {
      upsert: vi.fn(async ({ where, create, update }) => {
        const key = `${where.tenantId_namespace_key.tenantId}-${where.tenantId_namespace_key.namespace}-${where.tenantId_namespace_key.key}`;
        const existing = sharedData.get(key);
        if (existing) {
          const updated = { ...existing, ...update, updatedAt: new Date() };
          sharedData.set(key, updated);
          return updated;
        } else {
          const created = {
            ...create,
            id: `entry-${sharedData.size + 1}`,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          sharedData.set(key, created);
          return created;
        }
      }),
      findUnique: vi.fn(async ({ where }) => {
        const key = `${where.tenantId_namespace_key.tenantId}-${where.tenantId_namespace_key.namespace}-${where.tenantId_namespace_key.key}`;
        const entry = sharedData.get(key);
        if (!entry) return null;
        // Check if expired
        if (entry.expiresAt && new Date(entry.expiresAt) < new Date()) {
          return null; // Expired entries are not returned
        }
        return entry;
      }),
      findMany: vi.fn(async ({ where }) => {
        return Array.from(sharedData.values()).filter((entry) => {
          if (where.tenantId && entry.tenantId !== where.tenantId) return false;
          if (where.namespace && entry.namespace !== where.namespace) return false;
          if (where.ownerId && entry.ownerId !== where.ownerId) return false;
          return true;
        });
      }),
      deleteMany: vi.fn(async ({ where }) => {
        let count = 0;
        const keysToDelete: string[] = [];
        sharedData.forEach((entry, key) => {
          let shouldDelete = true;
          if (where.tenantId && entry.tenantId !== where.tenantId) shouldDelete = false;
          if (where.namespace && entry.namespace !== where.namespace) shouldDelete = false;
          if (where.key && entry.key !== where.key) shouldDelete = false;
          if (shouldDelete) {
            keysToDelete.push(key);
            count++;
          }
        });
        keysToDelete.forEach((key) => sharedData.delete(key));
        return { count };
      }),
    },
    __addPlugin: (id: string, version: string) => {
      plugins.set(id, { id, version });
    },
    __addTenantPlugin: (tenantId: string, pluginId: string) => {
      tenantPlugins.set(`${tenantId}-${pluginId}`, { tenantId, pluginId });
    },
    __clearAll: () => {
      services.clear();
      dependencies.clear();
      sharedData.clear();
      plugins.clear();
      tenantPlugins.clear();
    },
  } as any;
};

// Mock Redis
const createMockRedis = () => {
  const cache = new Map<string, string>();
  return {
    get: vi.fn(async (key: string) => cache.get(key) || null),
    setex: vi.fn(async (key: string, _ttl: number, value: string) => {
      cache.set(key, value);
      return 'OK';
    }),
    del: vi.fn(async (...keys: string[]) => {
      keys.forEach((key) => cache.delete(key));
      return keys.length;
    }),
    keys: vi.fn(async (pattern: string) => {
      const regex = new RegExp(pattern.replace('*', '.*'));
      return Array.from(cache.keys()).filter((k) => regex.test(k));
    }),
  } as any;
};

describe('Plugin-to-Plugin Communication Integration', () => {
  let mockPrisma: any;
  let mockRedis: any;
  let mockLogger: any;
  let serviceRegistry: ServiceRegistryService;
  let dependencyResolver: DependencyResolutionService;
  let sharedData: SharedDataService;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    mockRedis = createMockRedis();
    mockLogger = createMockLogger();

    serviceRegistry = new ServiceRegistryService(mockPrisma, mockRedis, mockLogger);
    dependencyResolver = new DependencyResolutionService(mockPrisma, mockLogger);
    sharedData = new SharedDataService(mockPrisma, mockRedis, mockLogger);
  });

  describe('Complete Plugin Lifecycle', () => {
    it('should validate, register, and discover CRM plugin services', async () => {
      // 1. Validate CRM manifest
      const crmManifest = {
        id: 'plugin-crm',
        name: 'CRM Plugin',
        version: '1.0.0',
        description: 'Customer Relationship Management',
        api: {
          services: [
            {
              name: 'crm.contacts',
              version: '1.0.0',
              endpoints: [
                { method: 'GET', path: '/contacts' },
                { method: 'POST', path: '/contacts' },
              ],
            },
          ],
        },
      };

      const validation = validatePluginManifest(crmManifest);
      expect(validation.valid).toBe(true);

      // 2. Register CRM service
      await serviceRegistry.registerService({
        pluginId: 'plugin-crm',
        tenantId: 'tenant-1',
        serviceName: 'crm.contacts',
        version: '1.0.0',
        baseUrl: 'http://localhost:3100',
        endpoints: [
          { method: 'GET', path: '/contacts' },
          { method: 'POST', path: '/contacts' },
        ],
      });

      // 3. Discover the service
      const service = await serviceRegistry.discoverService('tenant-1', 'crm.contacts');

      expect(service).not.toBeNull();
      expect(service?.pluginId).toBe('plugin-crm');
      expect(service?.serviceName).toBe('crm.contacts');
      expect(service?.status).toBe('HEALTHY');
    });

    it('should handle Analytics plugin with dependencies on CRM', async () => {
      // 1. Setup CRM plugin (dependency)
      mockPrisma.__addPlugin('plugin-crm', '1.0.0');
      mockPrisma.__addTenantPlugin('tenant-1', 'plugin-crm');

      await serviceRegistry.registerService({
        pluginId: 'plugin-crm',
        tenantId: 'tenant-1',
        serviceName: 'crm.contacts',
        version: '1.0.0',
      });

      // 2. Register Analytics dependencies
      await dependencyResolver.registerDependencies([
        {
          pluginId: 'plugin-analytics',
          dependsOnPluginId: 'plugin-crm',
          version: '^1.0.0',
          required: true,
        },
      ]);

      // 3. Setup Analytics plugin
      mockPrisma.__addPlugin('plugin-analytics', '1.0.0');

      // 4. Resolve dependencies for Analytics
      const resolution = await dependencyResolver.resolveDependencies(
        'plugin-analytics',
        'tenant-1'
      );

      expect(resolution.valid).toBe(true);
      expect(resolution.errors).toHaveLength(0);
    });

    it('should prevent uninstalling CRM when Analytics depends on it', async () => {
      // Setup plugins
      mockPrisma.__addPlugin('plugin-crm', '1.0.0');
      mockPrisma.__addPlugin('plugin-analytics', '1.0.0');
      mockPrisma.__addTenantPlugin('tenant-1', 'plugin-crm');
      mockPrisma.__addTenantPlugin('tenant-1', 'plugin-analytics');

      // Register dependency
      await dependencyResolver.registerDependencies([
        {
          pluginId: 'plugin-analytics',
          dependsOnPluginId: 'plugin-crm',
          version: '^1.0.0',
          required: true,
        },
      ]);

      // Try to uninstall CRM
      const canUninstall = await dependencyResolver.canUninstall('plugin-crm', 'tenant-1');

      expect(canUninstall.canUninstall).toBe(false);
      expect(canUninstall.blockedBy).toContain('plugin-analytics');
    });
  });

  describe('Cross-Plugin Data Sharing', () => {
    it('should allow CRM to share data with Analytics', async () => {
      const namespace = 'crm.analytics.sync';

      // CRM writes sync metadata
      await sharedData.set(
        'tenant-1',
        namespace,
        'last_export',
        {
          timestamp: '2025-01-22T00:00:00Z',
          recordCount: 100,
        },
        'plugin-crm'
      );

      // Analytics reads sync metadata
      const data = await sharedData.get('tenant-1', namespace, 'last_export');

      expect(data).not.toBeNull();
      expect(data.timestamp).toBe('2025-01-22T00:00:00Z');
      expect(data.recordCount).toBe(100);
    });

    it('should list all shared data in a namespace', async () => {
      const namespace = 'crm.analytics.metrics';

      await sharedData.set('tenant-1', namespace, 'metric1', { value: 100 }, 'plugin-crm');
      await sharedData.set('tenant-1', namespace, 'metric2', { value: 200 }, 'plugin-crm');
      await sharedData.set('tenant-1', namespace, 'metric3', { value: 300 }, 'plugin-analytics');

      const keys = await sharedData.listKeys('tenant-1', namespace);

      expect(keys).toHaveLength(3);
      expect(keys).toContain('metric1');
      expect(keys).toContain('metric2');
      expect(keys).toContain('metric3');
    });

    it('should filter shared data by owner', async () => {
      const namespace = 'shared.namespace';

      await sharedData.set('tenant-1', namespace, 'key1', { v: 1 }, 'plugin-crm');
      await sharedData.set('tenant-1', namespace, 'key2', { v: 2 }, 'plugin-analytics');

      const crmKeys = await sharedData.listKeys('tenant-1', namespace, {
        ownerId: 'plugin-crm',
      });

      expect(crmKeys).toHaveLength(1);
      expect(crmKeys).toContain('key1');
    });

    it('should handle TTL for temporary shared data', async () => {
      // Set data with very short TTL
      await sharedData.set(
        'tenant-1',
        'temp.namespace',
        'temp_key',
        { value: 'expires soon' },
        'plugin-crm',
        { ttl: 1 } // 1 second
      );

      // Data should exist immediately
      const data1 = await sharedData.get('tenant-1', 'temp.namespace', 'temp_key');
      expect(data1).not.toBeNull();

      // Simulate expiration by manually updating the entry
      const entry = await mockPrisma.sharedPluginData.findUnique({
        where: {
          tenantId_namespace_key: {
            tenantId: 'tenant-1',
            namespace: 'temp.namespace',
            key: 'temp_key',
          },
        },
      });

      if (entry) {
        entry.expiresAt = new Date(Date.now() - 1000); // Already expired
      }

      // Clear cache to force database lookup
      await mockRedis.del('shared:data:tenant-1:temp.namespace:temp_key');

      // Data should now be null (expired)
      const data2 = await sharedData.get('tenant-1', 'temp.namespace', 'temp_key');
      expect(data2).toBeNull();
    });
  });

  describe('Service Health Monitoring', () => {
    it('should track service health status', async () => {
      const serviceId = await serviceRegistry.registerService({
        pluginId: 'plugin-crm',
        tenantId: 'tenant-1',
        serviceName: 'crm.contacts',
        version: '1.0.0',
      });

      // Update to DEGRADED
      await serviceRegistry.updateServiceHealth(serviceId, 'DEGRADED' as any);

      const service = await serviceRegistry.discoverService('tenant-1', 'crm.contacts');
      expect(service?.status).toBe('DEGRADED');

      // Update to UNAVAILABLE
      await serviceRegistry.updateServiceHealth(serviceId, 'UNAVAILABLE' as any);

      const service2 = await serviceRegistry.discoverService('tenant-1', 'crm.contacts');
      expect(service2).toBeNull(); // Unavailable services are not discovered
    });
  });

  describe('Multi-Service Plugin', () => {
    it('should register and discover multiple services from same plugin', async () => {
      // CRM exposes both contacts and deals services
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

      const services = await serviceRegistry.listServices('tenant-1', {
        pluginId: 'plugin-crm',
      });

      expect(services).toHaveLength(2);
      expect(services.map((s) => s.serviceName)).toContain('crm.contacts');
      expect(services.map((s) => s.serviceName)).toContain('crm.deals');
    });
  });
});
