// Comprehensive tests for Plugin Service (Registry & Lifecycle)
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PluginRegistryService, PluginLifecycleService } from '../../../services/plugin.service';
import { db } from '../../../lib/db';
import { PluginStatus } from '@plexica/database';

// Mock database
vi.mock('../../../lib/db', () => ({
  db: {
    plugin: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    tenantPlugin: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

// Mock service registry and dependency resolver
vi.mock('../../services/service-registry.service', () => {
  return {
    ServiceRegistryService: class {
      registerService = vi.fn().mockResolvedValue({ id: 'service-1' });
    },
  };
});

vi.mock('../../services/dependency-resolution.service', () => {
  return {
    DependencyResolutionService: class {
      registerDependencies = vi.fn().mockResolvedValue(null);
    },
  };
});

vi.mock('../../lib/redis', () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

describe('PluginRegistryService', () => {
  let registryService: PluginRegistryService;

  beforeEach(() => {
    vi.clearAllMocks();
    registryService = new PluginRegistryService();
  });

  describe('registerPlugin', () => {
    it('should successfully register a valid plugin', async () => {
      const manifest = {
        id: 'plugin-test',
        name: 'Test Plugin',
        version: '1.0.0',
        description: 'A test plugin for testing purposes',
        category: 'analytics',
        metadata: {
          license: 'MIT',
          author: { name: 'Test Author', email: 'test@example.com' },
        },
      };

      const mockPlugin = {
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        status: PluginStatus.PUBLISHED,
        manifest,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(db.plugin.findUnique).mockResolvedValue(null);
      vi.mocked(db.plugin.create).mockResolvedValue(mockPlugin as any);

      const result = await registryService.registerPlugin(manifest as any);

      expect(result).toEqual(mockPlugin);
      expect(db.plugin.create).toHaveBeenCalled();
    });

    it('should throw error if plugin already exists', async () => {
      const manifest = {
        id: 'plugin-test',
        name: 'Test Plugin',
        version: '1.0.0',
        description: 'A test plugin for testing purposes',
        category: 'analytics',
        metadata: {
          license: 'MIT',
          author: { name: 'Test Author', email: 'test@example.com' },
        },
      };

      vi.mocked(db.plugin.findUnique).mockResolvedValue({} as any);

      await expect(registryService.registerPlugin(manifest as any)).rejects.toThrow(
        'already registered'
      );
    });

    it('should throw error for invalid manifest', async () => {
      const manifest = {
        id: 'invalid-id-format-too-long-and-not-following-pattern',
        name: 'Test Plugin',
        version: '1.0.0',
        description: 'A test plugin for testing purposes',
        category: 'analytics',
        metadata: {
          license: 'MIT',
          author: { name: 'Test Author', email: 'test@example.com' },
        },
      };

      vi.mocked(db.plugin.findUnique).mockResolvedValue(null);

      await expect(registryService.registerPlugin(manifest as any)).rejects.toThrow(
        'Invalid plugin manifest'
      );
    });

    it('should throw error for invalid manifest - missing name', async () => {
      const manifest = {
        id: 'plugin-test',
        name: '', // Empty name
        version: '1.0.0',
        description: 'A test plugin for testing purposes',
        category: 'analytics',
        metadata: {
          license: 'MIT',
          author: { name: 'Test Author', email: 'test@example.com' },
        },
      };

      vi.mocked(db.plugin.findUnique).mockResolvedValue(null);

      await expect(registryService.registerPlugin(manifest as any)).rejects.toThrow(
        'Invalid plugin manifest'
      );
    });

    it('should throw error for invalid version format', async () => {
      const manifest = {
        id: 'plugin-test',
        name: 'Test Plugin',
        version: '1.0', // Missing patch
        description: 'A test plugin for testing purposes',
        category: 'analytics',
        metadata: {
          license: 'MIT',
          author: { name: 'Test Author', email: 'test@example.com' },
        },
      };

      vi.mocked(db.plugin.findUnique).mockResolvedValue(null);

      await expect(registryService.registerPlugin(manifest as any)).rejects.toThrow(
        'Invalid plugin manifest'
      );
    });

    it('should throw error for short description', async () => {
      const manifest = {
        id: 'plugin-test',
        name: 'Test Plugin',
        version: '1.0.0',
        description: 'Short', // Too short
        category: 'analytics',
        metadata: {
          license: 'MIT',
          author: { name: 'Test Author', email: 'test@example.com' },
        },
      };

      vi.mocked(db.plugin.findUnique).mockResolvedValue(null);

      // This will pass Zod validation but fail on validateManifest
      await expect(registryService.registerPlugin(manifest as any)).rejects.toThrow(
        'Plugin description must be'
      );
    });

    it('should throw error for missing license', async () => {
      const manifest = {
        id: 'plugin-test',
        name: 'Test Plugin',
        version: '1.0.0',
        description: 'A test plugin for testing purposes',
        category: 'analytics',
        metadata: {
          author: { name: 'Test Author', email: 'test@example.com' },
        },
      };

      vi.mocked(db.plugin.findUnique).mockResolvedValue(null);

      // This will pass Zod validation but fail on validateManifest
      await expect(registryService.registerPlugin(manifest as any)).rejects.toThrow(
        'Plugin license is required'
      );
    });

    it('should throw error for missing author', async () => {
      const manifest = {
        id: 'plugin-test',
        name: 'Test Plugin',
        version: '1.0.0',
        description: 'A test plugin for testing purposes',
        category: 'analytics',
        metadata: {
          license: 'MIT',
          author: { email: 'test@example.com' },
        },
      };

      vi.mocked(db.plugin.findUnique).mockResolvedValue(null);

      // This will pass Zod validation but fail on validateManifest
      await expect(registryService.registerPlugin(manifest as any)).rejects.toThrow(
        'Plugin author name is required'
      );
    });
  });

  describe('updatePlugin', () => {
    it('should successfully update an existing plugin', async () => {
      const pluginId = 'plugin-test';
      const manifest = {
        id: pluginId,
        name: 'Updated Plugin',
        version: '2.0.0',
        description: 'Updated description for test plugin',
        category: 'analytics',
        metadata: {
          license: 'MIT',
          author: { name: 'Updated Author', email: 'updated@example.com' },
        },
      };

      const existingPlugin = { id: pluginId, name: 'Test Plugin', version: '1.0.0' };
      const updatedPlugin = { ...existingPlugin, ...manifest };

      vi.mocked(db.plugin.findUnique).mockResolvedValue(existingPlugin as any);
      vi.mocked(db.plugin.update).mockResolvedValue(updatedPlugin as any);

      const result = await registryService.updatePlugin(pluginId, manifest as any);

      expect(result).toEqual(updatedPlugin);
      expect(db.plugin.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: pluginId },
        })
      );
    });

    it('should throw error if plugin not found', async () => {
      const manifest = {
        id: 'plugin-test',
        name: 'Test Plugin',
        version: '1.0.0',
        description: 'A test plugin for testing purposes',
        category: 'analytics',
        metadata: {
          license: 'MIT',
          author: { name: 'Test Author', email: 'test@example.com' },
        },
      };

      vi.mocked(db.plugin.findUnique).mockResolvedValue(null);

      await expect(registryService.updatePlugin('non-existent', manifest as any)).rejects.toThrow(
        'not found'
      );
    });
  });

  describe('getPlugin', () => {
    it('should retrieve a plugin by ID', async () => {
      const pluginId = 'test-plugin';
      const mockPlugin = {
        id: pluginId,
        name: 'Test Plugin',
        version: '1.0.0',
        status: PluginStatus.PUBLISHED,
      };

      vi.mocked(db.plugin.findUnique).mockResolvedValue(mockPlugin as any);

      const result = await registryService.getPlugin(pluginId);

      expect(result).toEqual(mockPlugin);
      expect(db.plugin.findUnique).toHaveBeenCalledWith({
        where: { id: pluginId },
      });
    });

    it('should throw error if plugin not found', async () => {
      vi.mocked(db.plugin.findUnique).mockResolvedValue(null);

      await expect(registryService.getPlugin('non-existent')).rejects.toThrow('not found');
    });
  });

  describe('listPlugins', () => {
    it('should list all plugins without filters', async () => {
      const mockPlugins = [
        { id: 'plugin-1', name: 'Plugin 1', status: PluginStatus.PUBLISHED },
        { id: 'plugin-2', name: 'Plugin 2', status: PluginStatus.PUBLISHED },
      ];

      vi.mocked(db.plugin.findMany).mockResolvedValue(mockPlugins as any);
      vi.mocked(db.plugin.count).mockResolvedValue(2);

      const result = await registryService.listPlugins();

      expect(result.plugins).toEqual(mockPlugins);
      expect(result.total).toBe(2);
    });

    it('should filter plugins by status', async () => {
      vi.mocked(db.plugin.findMany).mockResolvedValue([]);
      vi.mocked(db.plugin.count).mockResolvedValue(0);

      await registryService.listPlugins({ status: PluginStatus.PUBLISHED });

      expect(db.plugin.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: PluginStatus.PUBLISHED }),
        })
      );
    });

    it('should filter plugins by category', async () => {
      vi.mocked(db.plugin.findMany).mockResolvedValue([]);
      vi.mocked(db.plugin.count).mockResolvedValue(0);

      await registryService.listPlugins({ category: 'analytics' });

      expect(db.plugin.findMany).toHaveBeenCalledWith(expect.any(Object));
      expect(db.plugin.count).toHaveBeenCalled();
    });

    it('should search plugins by name or id', async () => {
      vi.mocked(db.plugin.findMany).mockResolvedValue([]);
      vi.mocked(db.plugin.count).mockResolvedValue(0);

      await registryService.listPlugins({ search: 'analytics' });

      expect(db.plugin.findMany).toHaveBeenCalled();
    });

    it('should enforce pagination bounds', async () => {
      vi.mocked(db.plugin.findMany).mockResolvedValue([]);
      vi.mocked(db.plugin.count).mockResolvedValue(0);

      await registryService.listPlugins({ skip: 0, take: 1000 });

      // Should cap take at 500
      expect(db.plugin.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: expect.any(Number),
        })
      );
    });
  });

  describe('deletePlugin', () => {
    it('should delete plugin if not installed anywhere', async () => {
      const mockPlugin = {
        id: 'plugin-1',
        name: 'Test Plugin',
        version: '1.0.0',
        status: PluginStatus.PUBLISHED,
        manifest: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(db.plugin.findUnique).mockResolvedValue(mockPlugin as any);
      vi.mocked(db.tenantPlugin.count).mockResolvedValue(0);
      vi.mocked(db.plugin.delete).mockResolvedValue({} as any);

      await registryService.deletePlugin('plugin-1');

      expect(db.plugin.findUnique).toHaveBeenCalledWith({
        where: { id: 'plugin-1' },
      });
      expect(db.tenantPlugin.count).toHaveBeenCalledWith({
        where: { pluginId: 'plugin-1' },
      });
      expect(db.plugin.delete).toHaveBeenCalledWith({
        where: { id: 'plugin-1' },
      });
    });

    it('should throw error if plugin is installed in tenants', async () => {
      const mockPlugin = {
        id: 'plugin-1',
        name: 'Test Plugin',
        version: '1.0.0',
        status: PluginStatus.PUBLISHED,
        manifest: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(db.plugin.findUnique).mockResolvedValue(mockPlugin as any);
      vi.mocked(db.tenantPlugin.count).mockResolvedValue(3);

      await expect(registryService.deletePlugin('plugin-1')).rejects.toThrow('Cannot delete');
    });
  });

  describe('deprecatePlugin', () => {
    it('should mark plugin as deprecated', async () => {
      const mockPlugin = {
        id: 'plugin-1',
        status: PluginStatus.DEPRECATED,
      };

      vi.mocked(db.plugin.update).mockResolvedValue(mockPlugin as any);

      const result = await registryService.deprecatePlugin('plugin-1');

      expect(result.status).toBe(PluginStatus.DEPRECATED);
      expect(db.plugin.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'plugin-1' },
          data: { status: PluginStatus.DEPRECATED },
        })
      );
    });
  });

  describe('getPluginStats', () => {
    it('should return plugin statistics', async () => {
      const mockPlugin = {
        id: 'plugin-1',
        name: 'Test Plugin',
        version: '1.0.0',
      };

      // Mock database COUNT aggregations (new implementation uses COUNT queries)
      vi.mocked(db.plugin.findUnique).mockResolvedValue(mockPlugin as any);
      vi.mocked(db.tenantPlugin.count)
        .mockResolvedValueOnce(3) // Total installations
        .mockResolvedValueOnce(2) // Enabled installations
        .mockResolvedValueOnce(2); // Active tenants (enabled + active status)

      const result = await registryService.getPluginStats('plugin-1');

      expect(result.installCount).toBe(3);
      expect(result.activeTenants).toBe(2);
      expect(result.version).toBe('1.0.0');
    });

    it('should throw error if plugin not found', async () => {
      vi.mocked(db.plugin.findUnique).mockResolvedValue(null);

      await expect(registryService.getPluginStats('non-existent')).rejects.toThrow('not found');
    });
  });
});

describe('PluginLifecycleService', () => {
  let lifecycleService: PluginLifecycleService;

  beforeEach(() => {
    vi.clearAllMocks();
    lifecycleService = new PluginLifecycleService();
  });

  const validManifest = {
    id: 'test-plugin',
    name: 'Test Plugin',
    version: '1.0.0',
    description: 'A test plugin for testing purposes',
    category: 'analytics',
    metadata: {
      license: 'MIT',
      author: { name: 'Test Author', email: 'test@example.com' },
    },
  };

  describe('installPlugin', () => {
    it('should install plugin for tenant', async () => {
      const tenantId = 'tenant-1';
      const pluginId = 'test-plugin';
      const configuration = { key: 'value' };

      const mockPlugin = {
        id: pluginId,
        status: PluginStatus.PUBLISHED,
        manifest: validManifest,
      };

      const mockInstallation = {
        id: 'installation-1',
        tenantId,
        pluginId,
        enabled: false,
        configuration,
      };

      vi.mocked(db.plugin.findUnique).mockResolvedValue(mockPlugin as any);
      vi.mocked(db.tenantPlugin.findUnique).mockResolvedValue(null);
      vi.mocked(db.$transaction).mockImplementation(async (fn) => fn({} as any));

      // Mock transaction methods
      const mockTx = {
        tenantPlugin: {
          create: vi.fn().mockResolvedValue(mockInstallation),
        },
      };

      vi.mocked(db.$transaction).mockImplementation(async (fn) => fn(mockTx as any));

      const result = await lifecycleService.installPlugin(tenantId, pluginId, configuration);

      expect(result).toEqual(mockInstallation);
    });

    it('should throw error if plugin not available', async () => {
      const tenantId = 'tenant-1';
      const pluginId = 'test-plugin';

      const mockPlugin = {
        id: pluginId,
        status: PluginStatus.DEPRECATED,
        manifest: validManifest,
      };

      vi.mocked(db.plugin.findUnique).mockResolvedValue(mockPlugin as any);

      await expect(lifecycleService.installPlugin(tenantId, pluginId)).rejects.toThrow(
        'not available'
      );
    });

    it('should throw error if already installed', async () => {
      const tenantId = 'tenant-1';
      const pluginId = 'test-plugin';

      const mockPlugin = {
        id: pluginId,
        status: PluginStatus.PUBLISHED,
        manifest: validManifest,
      };

      const existingInstallation = {
        tenantId,
        pluginId,
        enabled: true,
      };

      vi.mocked(db.plugin.findUnique).mockResolvedValue(mockPlugin as any);
      vi.mocked(db.tenantPlugin.findUnique).mockResolvedValue(existingInstallation as any);

      await expect(lifecycleService.installPlugin(tenantId, pluginId)).rejects.toThrow(
        'already installed'
      );
    });

    it('should validate configuration before installation', async () => {
      const tenantId = 'tenant-1';
      const pluginId = 'test-plugin';

      const manifestWithConfig = {
        ...validManifest,
        config: [
          {
            key: 'api_key',
            type: 'string',
            required: true,
          },
        ],
      };

      const mockPlugin = {
        id: pluginId,
        status: PluginStatus.PUBLISHED,
        manifest: manifestWithConfig,
      };

      vi.mocked(db.plugin.findUnique).mockResolvedValue(mockPlugin as any);
      vi.mocked(db.tenantPlugin.findUnique).mockResolvedValue(null);

      // Missing required config field
      await expect(lifecycleService.installPlugin(tenantId, pluginId, {})).rejects.toThrow(
        'Required configuration'
      );
    });

    it('should check required dependencies', async () => {
      const tenantId = 'tenant-1';
      const pluginId = 'test-plugin';

      const manifestWithDeps = {
        ...validManifest,
        api: {
          dependencies: [
            {
              pluginId: 'dependency-plugin',
              version: '1.0.0',
              required: true,
            },
          ],
        },
      };

      const mockPlugin = {
        id: pluginId,
        status: PluginStatus.PUBLISHED,
        manifest: manifestWithDeps,
      };

      vi.mocked(db.plugin.findUnique).mockResolvedValue(mockPlugin as any);
      vi.mocked(db.tenantPlugin.findUnique)
        .mockResolvedValueOnce(null) // First call: check if already installed
        .mockResolvedValueOnce(null); // Second call: check dependency

      await expect(lifecycleService.installPlugin(tenantId, pluginId)).rejects.toThrow(
        'required dependency'
      );
    });
  });

  describe('activatePlugin', () => {
    it('should activate installed plugin', async () => {
      const tenantId = 'tenant-1';
      const pluginId = 'test-plugin';

      const mockInstallation = {
        tenantId,
        pluginId,
        enabled: false,
        plugin: { manifest: validManifest },
      };

      const activatedInstallation = {
        ...mockInstallation,
        enabled: true,
      };

      vi.mocked(db.tenantPlugin.findUnique).mockResolvedValueOnce(mockInstallation as any);
      vi.mocked(db.tenantPlugin.update).mockResolvedValue(activatedInstallation as any);

      const result = await lifecycleService.activatePlugin(tenantId, pluginId);

      expect(result.enabled).toBe(true);
    });

    it('should throw error if plugin not installed', async () => {
      vi.mocked(db.tenantPlugin.findUnique).mockResolvedValueOnce(null);

      await expect(lifecycleService.activatePlugin('tenant-1', 'test-plugin')).rejects.toThrow(
        'not installed'
      );
    });

    it('should throw error if already active', async () => {
      const mockInstallation = {
        enabled: true,
        plugin: { manifest: validManifest },
      };

      vi.mocked(db.tenantPlugin.findUnique).mockResolvedValueOnce(mockInstallation as any);

      await expect(lifecycleService.activatePlugin('tenant-1', 'test-plugin')).rejects.toThrow(
        'already active'
      );
    });
  });

  describe('deactivatePlugin', () => {
    it('should deactivate active plugin', async () => {
      const tenantId = 'tenant-1';
      const pluginId = 'test-plugin';

      const mockInstallation = {
        tenantId,
        pluginId,
        enabled: true,
        plugin: { manifest: validManifest },
      };

      const deactivatedInstallation = {
        ...mockInstallation,
        enabled: false,
      };

      vi.mocked(db.tenantPlugin.findUnique).mockResolvedValue(mockInstallation as any);
      vi.mocked(db.tenantPlugin.update).mockResolvedValue(deactivatedInstallation as any);

      const result = await lifecycleService.deactivatePlugin(tenantId, pluginId);

      expect(result.enabled).toBe(false);
    });

    it('should throw error if plugin not installed', async () => {
      vi.mocked(db.tenantPlugin.findUnique).mockResolvedValue(null);

      await expect(lifecycleService.deactivatePlugin('tenant-1', 'test-plugin')).rejects.toThrow(
        'not installed'
      );
    });

    it('should throw error if already inactive', async () => {
      const mockInstallation = {
        enabled: false,
        plugin: { manifest: validManifest },
      };

      vi.mocked(db.tenantPlugin.findUnique).mockResolvedValue(mockInstallation as any);

      await expect(lifecycleService.deactivatePlugin('tenant-1', 'test-plugin')).rejects.toThrow(
        'already inactive'
      );
    });
  });

  describe('uninstallPlugin', () => {
    it('should uninstall inactive plugin', async () => {
      const tenantId = 'tenant-1';
      const pluginId = 'test-plugin';

      const mockInstallation = {
        tenantId,
        pluginId,
        enabled: false,
        plugin: { manifest: validManifest },
      };

      vi.mocked(db.tenantPlugin.findUnique).mockResolvedValueOnce(mockInstallation as any);
      vi.mocked(db.tenantPlugin.delete).mockResolvedValue({} as any);

      await lifecycleService.uninstallPlugin(tenantId, pluginId);

      expect(db.tenantPlugin.delete).toHaveBeenCalledWith({
        where: {
          tenantId_pluginId: { tenantId, pluginId },
        },
      });
    });

    it('should throw error if plugin not installed', async () => {
      vi.mocked(db.tenantPlugin.findUnique).mockResolvedValueOnce(null);

      await expect(lifecycleService.uninstallPlugin('tenant-1', 'test-plugin')).rejects.toThrow(
        'not installed'
      );
    });
  });

  describe('updateConfiguration', () => {
    it('should update plugin configuration', async () => {
      const tenantId = 'tenant-1';
      const pluginId = 'test-plugin';
      const newConfig = { key: 'new-value' };

      const mockInstallation = {
        tenantId,
        pluginId,
        configuration: { key: 'old-value' },
        plugin: { manifest: validManifest },
      };

      const updatedInstallation = {
        ...mockInstallation,
        configuration: newConfig,
      };

      vi.mocked(db.tenantPlugin.findUnique).mockResolvedValue(mockInstallation as any);
      vi.mocked(db.tenantPlugin.update).mockResolvedValue(updatedInstallation as any);

      const result = await lifecycleService.updateConfiguration(tenantId, pluginId, newConfig);

      expect(result.configuration).toEqual(newConfig);
    });

    it('should throw error if plugin not installed', async () => {
      vi.mocked(db.tenantPlugin.findUnique).mockResolvedValue(null);

      await expect(
        lifecycleService.updateConfiguration('tenant-1', 'test-plugin', {})
      ).rejects.toThrow('not installed');
    });
  });

  describe('getInstalledPlugins', () => {
    it('should return all installed plugins for tenant', async () => {
      const tenantId = 'tenant-1';
      const mockInstallations = [
        { pluginId: 'plugin-1', enabled: true, plugin: { name: 'Plugin 1' } },
        { pluginId: 'plugin-2', enabled: false, plugin: { name: 'Plugin 2' } },
      ];

      vi.mocked(db.tenantPlugin.findMany).mockResolvedValue(mockInstallations as any);

      const result = await lifecycleService.getInstalledPlugins(tenantId);

      expect(result).toEqual(mockInstallations);
      expect(db.tenantPlugin.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId },
        })
      );
    });
  });
});
