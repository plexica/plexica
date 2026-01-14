import { db } from '../lib/db.js';
import type { PluginManifest } from '../types/plugin.types.js';
import { PluginStatus } from '@prisma/client';

/**
 * Plugin Registry Service
 * Manages the global registry of available plugins
 */
export class PluginRegistryService {
  /**
   * Register a new plugin in the global registry
   */
  async registerPlugin(manifest: PluginManifest): Promise<any> {
    // Validate manifest
    this.validateManifest(manifest);

    // Check if plugin already exists
    const existing = await db.plugin.findUnique({
      where: { id: manifest.id },
    });

    if (existing) {
      throw new Error(`Plugin '${manifest.id}' is already registered`);
    }

    // Create plugin entry
    const plugin = await db.plugin.create({
      data: {
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        manifest: manifest as any,
        status: PluginStatus.AVAILABLE,
      },
    });

    return plugin;
  }

  /**
   * Update an existing plugin
   */
  async updatePlugin(pluginId: string, manifest: PluginManifest): Promise<any> {
    this.validateManifest(manifest);

    const plugin = await db.plugin.findUnique({
      where: { id: pluginId },
    });

    if (!plugin) {
      throw new Error(`Plugin '${pluginId}' not found`);
    }

    // Update plugin
    const updated = await db.plugin.update({
      where: { id: pluginId },
      data: {
        name: manifest.name,
        version: manifest.version,
        manifest: manifest as any,
      },
    });

    return updated;
  }

  /**
   * Get plugin by ID
   */
  async getPlugin(pluginId: string): Promise<any> {
    const plugin = await db.plugin.findUnique({
      where: { id: pluginId },
    });

    if (!plugin) {
      throw new Error(`Plugin '${pluginId}' not found`);
    }

    return plugin;
  }

  /**
   * List all plugins in the registry
   */
  async listPlugins(options?: {
    status?: PluginStatus;
    category?: string;
    search?: string;
    skip?: number;
    take?: number;
  }): Promise<{ plugins: any[]; total: number }> {
    const { status, category, search, skip = 0, take = 50 } = options || {};

    const where: any = {};

    if (status) {
      where.status = status;
    }

    if (category) {
      where.manifest = {
        path: ['category'],
        equals: category,
      };
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { id: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [plugins, total] = await Promise.all([
      db.plugin.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      db.plugin.count({ where }),
    ]);

    return { plugins, total };
  }

  /**
   * Delete a plugin from the registry
   */
  async deletePlugin(pluginId: string): Promise<void> {
    // Check if plugin is installed in any tenant
    const installations = await db.tenantPlugin.count({
      where: { pluginId },
    });

    if (installations > 0) {
      throw new Error(
        `Cannot delete plugin '${pluginId}': it is installed in ${installations} tenant(s)`
      );
    }

    await db.plugin.delete({
      where: { id: pluginId },
    });
  }

  /**
   * Mark plugin as deprecated
   */
  async deprecatePlugin(pluginId: string): Promise<any> {
    const plugin = await db.plugin.update({
      where: { id: pluginId },
      data: { status: PluginStatus.DEPRECATED },
    });

    return plugin;
  }

  /**
   * Get plugin statistics
   */
  async getPluginStats(pluginId: string): Promise<{
    installCount: number;
    activeTenants: number;
    version: string;
  }> {
    const plugin = await this.getPlugin(pluginId);

    const installations = await db.tenantPlugin.findMany({
      where: { pluginId },
      include: { tenant: true },
    });

    const activeTenants = installations.filter(
      (i) => i.enabled && i.tenant.status === 'ACTIVE'
    ).length;

    return {
      installCount: installations.length,
      activeTenants,
      version: plugin.version,
    };
  }

  /**
   * Validate plugin manifest
   */
  private validateManifest(manifest: PluginManifest): void {
    if (!manifest.id || !/^[a-z0-9-]+$/.test(manifest.id)) {
      throw new Error('Plugin ID must be lowercase alphanumeric with hyphens');
    }

    if (!manifest.name || manifest.name.length < 3) {
      throw new Error('Plugin name must be at least 3 characters');
    }

    if (!manifest.version || !/^\d+\.\d+\.\d+$/.test(manifest.version)) {
      throw new Error('Plugin version must follow semver format (x.y.z)');
    }

    if (!manifest.description || manifest.description.length < 10) {
      throw new Error('Plugin description must be at least 10 characters');
    }

    if (!manifest.category) {
      throw new Error('Plugin category is required');
    }

    if (!manifest.metadata?.license) {
      throw new Error('Plugin license is required');
    }

    if (!manifest.metadata?.author?.name) {
      throw new Error('Plugin author name is required');
    }
  }
}

/**
 * Plugin Lifecycle Service
 * Manages plugin installation, activation, and removal for tenants
 */
export class PluginLifecycleService {
  private registry: PluginRegistryService;

  constructor() {
    this.registry = new PluginRegistryService();
  }

  /**
   * Install a plugin for a tenant
   */
  async installPlugin(
    tenantId: string,
    pluginId: string,
    configuration: Record<string, any> = {}
  ): Promise<any> {
    // Get plugin from registry
    const plugin = await this.registry.getPlugin(pluginId);

    if (plugin.status !== PluginStatus.AVAILABLE) {
      throw new Error(`Plugin '${pluginId}' is not available for installation`);
    }

    // Check if already installed
    const existing = await db.tenantPlugin.findUnique({
      where: {
        tenantId_pluginId: { tenantId, pluginId },
      },
    });

    if (existing) {
      throw new Error(`Plugin '${pluginId}' is already installed`);
    }

    // Validate configuration
    const manifest = plugin.manifest as unknown as PluginManifest;
    this.validateConfiguration(manifest, configuration);

    // Check dependencies
    await this.checkDependencies(tenantId, manifest);

    // Create installation
    const installation = await db.tenantPlugin.create({
      data: {
        tenantId,
        pluginId,
        enabled: false, // Start disabled, must be explicitly activated
        configuration,
      },
      include: {
        plugin: true,
        tenant: true,
      },
    });

    // Run installation lifecycle hook if defined
    if (manifest.lifecycle?.install) {
      try {
        await this.runLifecycleHook(manifest, 'install', {
          tenantId,
          pluginId,
          configuration,
        });
      } catch (error: any) {
        // Rollback installation on error
        await db.tenantPlugin.delete({
          where: {
            tenantId_pluginId: { tenantId, pluginId },
          },
        });
        throw new Error(`Plugin installation failed: ${error.message}`);
      }
    }

    return installation;
  }

  /**
   * Activate a plugin for a tenant
   */
  async activatePlugin(tenantId: string, pluginId: string): Promise<any> {
    const installation = await db.tenantPlugin.findUnique({
      where: {
        tenantId_pluginId: { tenantId, pluginId },
      },
      include: { plugin: true },
    });

    if (!installation) {
      throw new Error(`Plugin '${pluginId}' is not installed`);
    }

    if (installation.enabled) {
      throw new Error(`Plugin '${pluginId}' is already active`);
    }

    const manifest = installation.plugin.manifest as unknown as PluginManifest;

    // Run activation lifecycle hook if defined
    if (manifest.lifecycle?.activate) {
      await this.runLifecycleHook(manifest, 'activate', {
        tenantId,
        pluginId,
        configuration: installation.configuration,
      });
    }

    // Enable plugin
    const updated = await db.tenantPlugin.update({
      where: {
        tenantId_pluginId: { tenantId, pluginId },
      },
      data: { enabled: true },
    });

    return updated;
  }

  /**
   * Deactivate a plugin for a tenant
   */
  async deactivatePlugin(tenantId: string, pluginId: string): Promise<any> {
    const installation = await db.tenantPlugin.findUnique({
      where: {
        tenantId_pluginId: { tenantId, pluginId },
      },
      include: { plugin: true },
    });

    if (!installation) {
      throw new Error(`Plugin '${pluginId}' is not installed`);
    }

    if (!installation.enabled) {
      throw new Error(`Plugin '${pluginId}' is already inactive`);
    }

    const manifest = installation.plugin.manifest as unknown as PluginManifest;

    // Run deactivation lifecycle hook if defined
    if (manifest.lifecycle?.deactivate) {
      await this.runLifecycleHook(manifest, 'deactivate', {
        tenantId,
        pluginId,
        configuration: installation.configuration,
      });
    }

    // Disable plugin
    const updated = await db.tenantPlugin.update({
      where: {
        tenantId_pluginId: { tenantId, pluginId },
      },
      data: { enabled: false },
    });

    return updated;
  }

  /**
   * Uninstall a plugin from a tenant
   */
  async uninstallPlugin(tenantId: string, pluginId: string): Promise<void> {
    const installation = await db.tenantPlugin.findUnique({
      where: {
        tenantId_pluginId: { tenantId, pluginId },
      },
      include: { plugin: true },
    });

    if (!installation) {
      throw new Error(`Plugin '${pluginId}' is not installed`);
    }

    // Deactivate first if enabled
    if (installation.enabled) {
      await this.deactivatePlugin(tenantId, pluginId);
    }

    const manifest = installation.plugin.manifest as unknown as PluginManifest;

    // Run uninstall lifecycle hook if defined
    if (manifest.lifecycle?.uninstall) {
      await this.runLifecycleHook(manifest, 'uninstall', {
        tenantId,
        pluginId,
        configuration: installation.configuration,
      });
    }

    // Remove installation
    await db.tenantPlugin.delete({
      where: {
        tenantId_pluginId: { tenantId, pluginId },
      },
    });
  }

  /**
   * Update plugin configuration
   */
  async updateConfiguration(
    tenantId: string,
    pluginId: string,
    configuration: Record<string, any>
  ): Promise<any> {
    const installation = await db.tenantPlugin.findUnique({
      where: {
        tenantId_pluginId: { tenantId, pluginId },
      },
      include: { plugin: true },
    });

    if (!installation) {
      throw new Error(`Plugin '${pluginId}' is not installed`);
    }

    const manifest = installation.plugin.manifest as unknown as PluginManifest;
    this.validateConfiguration(manifest, configuration);

    const updated = await db.tenantPlugin.update({
      where: {
        tenantId_pluginId: { tenantId, pluginId },
      },
      data: { configuration },
    });

    return updated;
  }

  /**
   * Get installed plugins for a tenant
   */
  async getInstalledPlugins(tenantId: string): Promise<any[]> {
    const installations = await db.tenantPlugin.findMany({
      where: { tenantId },
      include: { plugin: true },
      orderBy: { installedAt: 'desc' },
    });

    return installations;
  }

  /**
   * Validate plugin configuration against manifest
   */
  private validateConfiguration(
    manifest: PluginManifest,
    configuration: Record<string, any>
  ): void {
    if (!manifest.config) return;

    for (const field of manifest.config) {
      const value = configuration[field.key];

      if (field.required && (value === undefined || value === null)) {
        throw new Error(`Required configuration field '${field.key}' is missing`);
      }

      if (value !== undefined && value !== null) {
        // Type validation
        const actualType = typeof value;
        if (field.type === 'json' && actualType !== 'object') {
          throw new Error(`Configuration field '${field.key}' must be an object`);
        } else if (field.type !== 'json' && field.type !== actualType) {
          throw new Error(`Configuration field '${field.key}' must be of type ${field.type}`);
        }

        // Additional validation
        if (field.validation) {
          if (field.validation.pattern && typeof value === 'string') {
            const regex = new RegExp(field.validation.pattern);
            if (!regex.test(value)) {
              throw new Error(
                field.validation.message ||
                  `Configuration field '${field.key}' does not match required pattern`
              );
            }
          }

          if (field.validation.min !== undefined && value < field.validation.min) {
            throw new Error(
              `Configuration field '${field.key}' must be at least ${field.validation.min}`
            );
          }

          if (field.validation.max !== undefined && value > field.validation.max) {
            throw new Error(
              `Configuration field '${field.key}' must be at most ${field.validation.max}`
            );
          }
        }
      }
    }
  }

  /**
   * Check plugin dependencies
   */
  private async checkDependencies(tenantId: string, manifest: PluginManifest): Promise<void> {
    if (!manifest.dependencies) return;

    // Check required dependencies
    if (manifest.dependencies.required) {
      for (const [depId, _version] of Object.entries(manifest.dependencies.required)) {
        const installation = await db.tenantPlugin.findUnique({
          where: {
            tenantId_pluginId: { tenantId, pluginId: depId },
          },
          include: { plugin: true },
        });

        if (!installation || !installation.enabled) {
          throw new Error(`Required plugin dependency '${depId}' is not installed or active`);
        }

        // TODO: Implement version checking
      }
    }

    // Check conflicts
    if (manifest.dependencies.conflicts) {
      for (const conflictId of manifest.dependencies.conflicts) {
        const installation = await db.tenantPlugin.findUnique({
          where: {
            tenantId_pluginId: { tenantId, pluginId: conflictId },
          },
        });

        if (installation && installation.enabled) {
          throw new Error(`Plugin conflicts with installed plugin '${conflictId}'`);
        }
      }
    }
  }

  /**
   * Run plugin lifecycle hook
   */
  private async runLifecycleHook(
    manifest: PluginManifest,
    hook: string,
    _context: any
  ): Promise<void> {
    // TODO: Implement actual hook execution
    // This would load the plugin code and execute the lifecycle function
    // For now, just log
    console.log(`Running lifecycle hook '${hook}' for plugin '${manifest.id}'`);
  }
}

// Singleton instances
export const pluginRegistryService = new PluginRegistryService();
export const pluginLifecycleService = new PluginLifecycleService();
