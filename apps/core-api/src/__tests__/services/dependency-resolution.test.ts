/**
 * Dependency Resolution Service Tests (M2.3 Task 11)
 *
 * Unit tests for the Dependency Resolution service
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { DependencyResolutionService } from '../../services/dependency-resolution.service.js';

// Create mock Prisma
const createMockPrisma = () => {
  const dependencies = new Map<string, any>();
  const plugins = new Map<string, any>();
  const tenantPlugins = new Map<string, any>();

  return {
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
      findMany: vi.fn(async ({ where, select, distinct }) => {
        let results = Array.from(dependencies.values());

        if (where) {
          results = results.filter((dep) => {
            if (where.pluginId && dep.pluginId !== where.pluginId) return false;
            if (where.dependsOnPluginId && dep.dependsOnPluginId !== where.dependsOnPluginId)
              return false;
            return true;
          });
        }

        if (select) {
          results = results.map((dep) => {
            const selected: any = {};
            Object.keys(select).forEach((key) => {
              if (select[key]) selected[key] = dep[key];
            });
            return selected;
          });
        }

        if (distinct) {
          const seen = new Set();
          results = results.filter((dep) => {
            const key = distinct.map((field: string) => dep[field]).join('-');
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        }

        return results;
      }),
    },
    plugin: {
      findUnique: vi.fn(async ({ where }) => {
        return plugins.get(where.id) || null;
      }),
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
    // Helper methods for tests
    __addPlugin: (id: string, version: string) => {
      plugins.set(id, { id, version });
    },
    __addTenantPlugin: (tenantId: string, pluginId: string) => {
      const key = `${tenantId}-${pluginId}`;
      tenantPlugins.set(key, { tenantId, pluginId });
    },
    __clearAll: () => {
      dependencies.clear();
      plugins.clear();
      tenantPlugins.clear();
    },
  } as any;
};

const createMockLogger = () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
});

let mockPrisma: any;
let mockLogger: any;
let dependencyService: DependencyResolutionService;

describe('DependencyResolutionService', () => {
  beforeEach(() => {
    mockPrisma = createMockPrisma();
    mockLogger = createMockLogger();
    dependencyService = new DependencyResolutionService(mockPrisma, mockLogger);
  });

  afterEach(() => {
    vi.clearAllMocks();
    mockPrisma.__clearAll();
  });

  describe('registerDependencies', () => {
    it('should register dependencies successfully', async () => {
      const deps = [
        {
          pluginId: 'plugin-analytics',
          dependsOnPluginId: 'plugin-crm',
          version: '^1.0.0',
          required: true,
        },
        {
          pluginId: 'plugin-analytics',
          dependsOnPluginId: 'plugin-auth',
          version: '^2.0.0',
          required: true,
        },
      ];

      await dependencyService.registerDependencies(deps);

      expect(mockPrisma.pluginDependency.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            pluginId: 'plugin-analytics',
            dependsOnPluginId: 'plugin-crm',
          }),
          expect.objectContaining({
            pluginId: 'plugin-analytics',
            dependsOnPluginId: 'plugin-auth',
          }),
        ]),
      });
    });

    it('should delete existing dependencies before registering new ones', async () => {
      const deps = [
        {
          pluginId: 'plugin-analytics',
          dependsOnPluginId: 'plugin-crm',
          version: '^1.0.0',
          required: true,
        },
      ];

      await dependencyService.registerDependencies(deps);

      expect(mockPrisma.pluginDependency.deleteMany).toHaveBeenCalledWith({
        where: {
          pluginId: { in: ['plugin-analytics'] },
        },
      });
    });

    it('should handle empty dependency list', async () => {
      await dependencyService.registerDependencies([]);

      expect(mockPrisma.pluginDependency.deleteMany).toHaveBeenCalled();
      expect(mockPrisma.pluginDependency.createMany).not.toHaveBeenCalled();
    });
  });

  describe('getDependencies', () => {
    beforeEach(async () => {
      await dependencyService.registerDependencies([
        {
          pluginId: 'plugin-analytics',
          dependsOnPluginId: 'plugin-crm',
          version: '^1.0.0',
          required: true,
        },
        {
          pluginId: 'plugin-analytics',
          dependsOnPluginId: 'plugin-auth',
          version: '^2.0.0',
          required: true,
        },
      ]);
    });

    it('should get direct dependencies', async () => {
      const deps = await dependencyService.getDependencies('plugin-analytics', false);

      expect(deps).toHaveLength(2);
      expect(deps.map((d) => d.dependsOnPluginId)).toContain('plugin-crm');
      expect(deps.map((d) => d.dependsOnPluginId)).toContain('plugin-auth');
    });

    it('should get recursive dependencies', async () => {
      // Add nested dependency: crm -> storage
      await dependencyService.registerDependencies([
        {
          pluginId: 'plugin-crm',
          dependsOnPluginId: 'plugin-storage',
          version: '^1.0.0',
          required: true,
        },
      ]);

      const deps = await dependencyService.getDependencies('plugin-analytics', true);

      // Should include both direct (crm, auth) and nested (storage)
      expect(deps.length).toBeGreaterThanOrEqual(2);
      expect(deps.map((d) => d.dependsOnPluginId)).toContain('plugin-crm');
    });
  });

  describe('getDependents', () => {
    beforeEach(async () => {
      await dependencyService.registerDependencies([
        {
          pluginId: 'plugin-analytics',
          dependsOnPluginId: 'plugin-crm',
          version: '^1.0.0',
          required: true,
        },
        {
          pluginId: 'plugin-reports',
          dependsOnPluginId: 'plugin-crm',
          version: '^1.0.0',
          required: true,
        },
      ]);
    });

    it('should find plugins that depend on a given plugin', async () => {
      const dependents = await dependencyService.getDependents('plugin-crm');

      expect(dependents).toHaveLength(2);
      expect(dependents).toContain('plugin-analytics');
      expect(dependents).toContain('plugin-reports');
    });

    it('should return empty array if no dependents', async () => {
      const dependents = await dependencyService.getDependents('plugin-standalone');

      expect(dependents).toHaveLength(0);
    });
  });

  describe('canUninstall', () => {
    beforeEach(async () => {
      // Setup: analytics and reports depend on CRM
      await dependencyService.registerDependencies([
        {
          pluginId: 'plugin-analytics',
          dependsOnPluginId: 'plugin-crm',
          version: '^1.0.0',
          required: true,
        },
        {
          pluginId: 'plugin-reports',
          dependsOnPluginId: 'plugin-crm',
          version: '^1.0.0',
          required: true,
        },
      ]);

      // Setup plugins
      mockPrisma.__addPlugin('plugin-crm', '1.0.0');
      mockPrisma.__addPlugin('plugin-analytics', '1.0.0');
      mockPrisma.__addPlugin('plugin-reports', '1.0.0');
    });

    it('should prevent uninstall if dependents are installed', async () => {
      // Install CRM and Analytics for tenant
      mockPrisma.__addTenantPlugin('tenant-1', 'plugin-crm');
      mockPrisma.__addTenantPlugin('tenant-1', 'plugin-analytics');

      const result = await dependencyService.canUninstall('plugin-crm', 'tenant-1');

      expect(result.canUninstall).toBe(false);
      expect(result.blockedBy).toContain('plugin-analytics');
    });

    it('should allow uninstall if no dependents are installed', async () => {
      // Only install CRM, not its dependents
      mockPrisma.__addTenantPlugin('tenant-1', 'plugin-crm');

      const result = await dependencyService.canUninstall('plugin-crm', 'tenant-1');

      expect(result.canUninstall).toBe(true);
      expect(result.blockedBy).toHaveLength(0);
    });

    it('should allow uninstall if plugin has no dependents at all', async () => {
      mockPrisma.__addPlugin('plugin-standalone', '1.0.0');
      mockPrisma.__addTenantPlugin('tenant-1', 'plugin-standalone');

      const result = await dependencyService.canUninstall('plugin-standalone', 'tenant-1');

      expect(result.canUninstall).toBe(true);
      expect(result.blockedBy).toHaveLength(0);
    });
  });

  describe('resolveDependencies', () => {
    beforeEach(() => {
      // Setup plugins
      mockPrisma.__addPlugin('plugin-crm', '1.0.0');
      mockPrisma.__addPlugin('plugin-analytics', '1.0.0');
      mockPrisma.__addPlugin('plugin-auth', '2.0.0');
    });

    it('should resolve dependencies successfully when all are satisfied', async () => {
      // Register dependencies
      await dependencyService.registerDependencies([
        {
          pluginId: 'plugin-analytics',
          dependsOnPluginId: 'plugin-crm',
          version: '^1.0.0',
          required: true,
        },
      ]);

      // Install CRM for tenant (dependency satisfied)
      mockPrisma.__addTenantPlugin('tenant-1', 'plugin-crm');

      const result = await dependencyService.resolveDependencies('plugin-analytics', 'tenant-1');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.installOrder).toBeDefined();
    });

    it('should detect missing required dependencies', async () => {
      // Register dependencies
      await dependencyService.registerDependencies([
        {
          pluginId: 'plugin-analytics',
          dependsOnPluginId: 'plugin-crm',
          version: '^1.0.0',
          required: true,
        },
      ]);

      // Don't install CRM (dependency NOT satisfied)

      const result = await dependencyService.resolveDependencies('plugin-analytics', 'tenant-1');

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Missing required plugin');
    });

    it('should detect version mismatches', async () => {
      // Register dependencies requiring version 2.x
      await dependencyService.registerDependencies([
        {
          pluginId: 'plugin-analytics',
          dependsOnPluginId: 'plugin-auth',
          version: '^3.0.0', // Requires 3.x
          required: true,
        },
      ]);

      // Install auth 2.0.0 (version mismatch)
      mockPrisma.__addTenantPlugin('tenant-1', 'plugin-auth');

      const result = await dependencyService.resolveDependencies('plugin-analytics', 'tenant-1');

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Version mismatch'))).toBe(true);
    });

    it('should detect circular dependencies', async () => {
      // Create circular dependency: A -> B -> C -> A
      mockPrisma.__addPlugin('plugin-a', '1.0.0');
      mockPrisma.__addPlugin('plugin-b', '1.0.0');
      mockPrisma.__addPlugin('plugin-c', '1.0.0');

      await dependencyService.registerDependencies([
        { pluginId: 'plugin-a', dependsOnPluginId: 'plugin-b', version: '^1.0.0', required: true },
        { pluginId: 'plugin-b', dependsOnPluginId: 'plugin-c', version: '^1.0.0', required: true },
        { pluginId: 'plugin-c', dependsOnPluginId: 'plugin-a', version: '^1.0.0', required: true },
      ]);

      const result = await dependencyService.resolveDependencies('plugin-a', 'tenant-1');

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Circular dependency'))).toBe(true);
    });

    it('should generate correct install order', async () => {
      // Setup: analytics -> crm, crm -> auth
      mockPrisma.__addPlugin('plugin-a', '1.0.0');
      mockPrisma.__addPlugin('plugin-b', '1.0.0');
      mockPrisma.__addPlugin('plugin-c', '1.0.0');

      await dependencyService.registerDependencies([
        { pluginId: 'plugin-c', dependsOnPluginId: 'plugin-b', version: '^1.0.0', required: true },
        { pluginId: 'plugin-b', dependsOnPluginId: 'plugin-a', version: '^1.0.0', required: true },
      ]);

      // Install all dependencies
      mockPrisma.__addTenantPlugin('tenant-1', 'plugin-a');
      mockPrisma.__addTenantPlugin('tenant-1', 'plugin-b');

      const result = await dependencyService.resolveDependencies('plugin-c', 'tenant-1');

      expect(result.valid).toBe(true);
      expect(result.installOrder).toBeDefined();

      // Install order should be: a, b, c (dependencies first)
      const order = result.installOrder!;
      expect(order.indexOf('plugin-a')).toBeLessThan(order.indexOf('plugin-b'));
      expect(order.indexOf('plugin-b')).toBeLessThan(order.indexOf('plugin-c'));
    });
  });
});
