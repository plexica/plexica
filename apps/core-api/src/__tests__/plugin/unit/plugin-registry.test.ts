// Unit tests for PluginRegistryService
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PluginRegistryService } from '../../../services/plugin.service';
import { db } from '../../../lib/db';

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
      create: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
  },
}));

describe('PluginRegistryService', () => {
  let service: PluginRegistryService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new PluginRegistryService();
  });

  describe('listPlugins', () => {
    it('should return all available plugins', async () => {
      const mockPlugins = [
        {
          id: 'plugin-1',
          name: 'Analytics Plugin',
          version: '1.0.0',
          status: 'AVAILABLE',
          manifest: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      vi.mocked(db.plugin.findMany).mockResolvedValue(mockPlugins as any);
      vi.mocked(db.plugin.count).mockResolvedValue(1);

      const result = await service.listPlugins();

      expect(db.plugin.findMany).toHaveBeenCalled();
      expect(result.plugins).toEqual(mockPlugins);
      expect(result.total).toBe(1);
    });

    it('should filter plugins by status', async () => {
      vi.mocked(db.plugin.findMany).mockResolvedValue([]);
      vi.mocked(db.plugin.count).mockResolvedValue(0);

      await service.listPlugins({ status: 'AVAILABLE' as any });

      expect(db.plugin.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'AVAILABLE' },
        })
      );
    });
  });

  describe('registerPlugin', () => {
    it('should register a new plugin', async () => {
      const manifest = {
        id: 'plugin-test',
        name: 'Test Plugin',
        version: '1.0.0',
        description: 'A test plugin for testing',
        category: 'analytics',
        metadata: {
          license: 'MIT',
          author: {
            name: 'Test Author',
            email: 'test@example.com',
          },
        },
      };

      const mockPlugin = {
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        status: 'AVAILABLE',
        manifest: manifest,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(db.plugin.findUnique).mockResolvedValue(null);
      vi.mocked(db.plugin.create).mockResolvedValue(mockPlugin as any);

      const result = await service.registerPlugin(manifest as any);

      expect(db.plugin.create).toHaveBeenCalledWith({
        data: {
          id: manifest.id,
          name: manifest.name,
          version: manifest.version,
          manifest: manifest,
          status: 'PUBLISHED',
        },
      });

      expect(result).toEqual(mockPlugin);
    });
  });

  describe('deletePlugin', () => {
    it('should delete a plugin when not installed in any tenant', async () => {
      vi.mocked(db.tenantPlugin.count).mockResolvedValue(0);
      vi.mocked(db.plugin.delete).mockResolvedValue({} as any);

      await service.deletePlugin('plugin-1');

      expect(db.tenantPlugin.count).toHaveBeenCalledWith({
        where: { pluginId: 'plugin-1' },
      });
      expect(db.plugin.delete).toHaveBeenCalledWith({
        where: { id: 'plugin-1' },
      });
    });

    it('should throw error when plugin is installed in tenants', async () => {
      vi.mocked(db.tenantPlugin.count).mockResolvedValue(3);

      await expect(service.deletePlugin('plugin-1')).rejects.toThrow('Cannot delete plugin');
    });
  });

  describe('deprecatePlugin', () => {
    it('should mark a plugin as deprecated', async () => {
      const mockPlugin = {
        id: 'plugin-1',
        name: 'Test Plugin',
        version: '1.0.0',
        status: 'DEPRECATED',
        manifest: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(db.plugin.update).mockResolvedValue(mockPlugin as any);

      const result = await service.deprecatePlugin('plugin-1');

      expect(db.plugin.update).toHaveBeenCalledWith({
        where: { id: 'plugin-1' },
        data: { status: 'DEPRECATED' },
      });
      expect(result.status).toBe('DEPRECATED');
    });
  });
});
