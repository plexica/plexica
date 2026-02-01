// @ts-nocheck
import { db } from '../lib/db.js';
import type { PluginManifest } from '../types/plugin.types.js';
import { PluginStatus } from '@plexica/database';
import { validatePluginManifest } from '../schemas/plugin-manifest.schema.js';
import { ServiceRegistryService } from './service-registry.service.js';
import { DependencyResolutionService } from './dependency-resolution.service.js';
import { redis } from '../lib/redis.js';
import semver from 'semver';
import { TENANT_STATUS } from '../constants/index.js';

/**
 * Plugin Registry Service
 * Manages the global registry of available plugins
 */
export class PluginRegistryService {
  private serviceRegistry: ServiceRegistryService;
  private dependencyResolver: DependencyResolutionService;

  constructor() {
    // SECURITY: Use silent logger to prevent sensitive data leaks
    // Debug logging disabled in production
    const isProduction = process.env.NODE_ENV === 'production';
    const silentLogger = {
      info: isProduction ? () => {} : (...args: any[]) => console.log('[INFO]', ...args),
      error: (...args: any[]) => console.error('[ERROR]', ...args),
      warn: (...args: any[]) => console.warn('[WARN]', ...args),
      debug: isProduction ? () => {} : (...args: any[]) => console.debug('[DEBUG]', ...args),
    } as any;

    this.serviceRegistry = new ServiceRegistryService(db as any, redis, silentLogger);
    this.dependencyResolver = new DependencyResolutionService(db as any, silentLogger);
  }

  /**
   * Register a new plugin in the global registry
   */
  async registerPlugin(manifest: PluginManifest): Promise<any> {
    // Validate manifest using Zod schema (M2.3)
    const validation = validatePluginManifest(manifest);
    if (!validation.valid) {
      const errorMessages = validation.errors?.map((e) => `${e.path}: ${e.message}`).join('; ');
      throw new Error(`Invalid plugin manifest: ${errorMessages}`);
    }

    // Additional basic validation
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
        status: PluginStatus.PUBLISHED,
      },
    });

    // M2.3: Auto-register API services if defined
    if (manifest.api?.services) {
      for (const service of manifest.api.services) {
        try {
          await this.serviceRegistry.registerService({
            pluginId: manifest.id,
            tenantId: 'global', // Global registry, not tenant-specific yet
            serviceName: service.name,
            version: service.version,
            baseUrl: service.baseUrl || `http://plugin-${manifest.id}:8080`,
            endpoints: service.endpoints?.map((ep) => ({
              method: ep.method,
              path: ep.path,
              description: ep.description,
              permissions: ep.permissions,
              metadata: ep.metadata,
            })),
            metadata: service.metadata,
          });
        } catch (error: any) {
          // Log errors but continue with other services
          console.error(`Failed to register service '${service.name}':`, error.message);
          // Continue with other services, don't fail the entire registration
        }
      }
    }

    // M2.3: Store plugin dependencies if defined
    if (manifest.api?.dependencies) {
      const dependencies = manifest.api.dependencies.map((dep) => ({
        pluginId: manifest.id,
        dependsOnPluginId: dep.pluginId,
        version: dep.version,
        required: dep.required,
      }));

      await this.dependencyResolver.registerDependencies(dependencies);
    }

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

    // Enforce bounds on pagination
    const validatedSkip = Math.max(0, skip);
    const validatedTake = Math.max(1, Math.min(take, 500)); // Max 500 results per page

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
        skip: validatedSkip,
        take: validatedTake,
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
    // Fetch plugin and installation stats in parallel (not sequentially)
    const [plugin, installations] = await Promise.all([
      db.plugin.findUnique({
        where: { id: pluginId },
      }),
      db.tenantPlugin.findMany({
        where: { pluginId },
        include: { tenant: true },
      }),
    ]);

    if (!plugin) {
      throw new Error(`Plugin '${pluginId}' not found`);
    }

    const activeTenants = installations.filter(
      (i) => i.enabled && i.tenant.status === TENANT_STATUS.ACTIVE
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
    if (!manifest.id || !/^[a-z0-9-]{1,64}$/.test(manifest.id)) {
      throw new Error('Plugin ID must be 1-64 chars, lowercase alphanumeric with hyphens');
    }

    if (!manifest.name || manifest.name.length < 3 || manifest.name.length > 255) {
      throw new Error('Plugin name must be 3-255 characters');
    }

    if (!manifest.version || !/^\d+\.\d+\.\d+$/.test(manifest.version)) {
      throw new Error('Plugin version must follow semver format (x.y.z)');
    }

    if (
      !manifest.description ||
      manifest.description.length < 10 ||
      manifest.description.length > 1000
    ) {
      throw new Error('Plugin description must be 10-1000 characters');
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
  private serviceRegistry: ServiceRegistryService;
  private dependencyResolver: DependencyResolutionService;

  constructor() {
    this.registry = new PluginRegistryService();

    // SECURITY: Use silent logger to prevent sensitive data leaks
    const isProduction = process.env.NODE_ENV === 'production';
    const silentLogger = {
      info: isProduction ? () => {} : (...args: any[]) => console.log('[INFO]', ...args),
      error: (...args: any[]) => console.error('[ERROR]', ...args),
      warn: (...args: any[]) => console.warn('[WARN]', ...args),
      debug: isProduction ? () => {} : (...args: any[]) => console.debug('[DEBUG]', ...args),
    } as any;

    this.serviceRegistry = new ServiceRegistryService(db as any, redis, silentLogger);
    this.dependencyResolver = new DependencyResolutionService(db as any, silentLogger);
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

    if (plugin.status !== PluginStatus.PUBLISHED) {
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

    // M2.3: Check API dependencies before installation
    if (manifest.api?.dependencies && manifest.api.dependencies.length > 0) {
      for (const dep of manifest.api.dependencies) {
        // Check if dependency plugin is installed for this tenant
        const depInstalled = await db.tenantPlugin.findUnique({
          where: {
            tenantId_pluginId: { tenantId, pluginId: dep.pluginId },
          },
          include: { plugin: true },
        });

        if (!depInstalled) {
          if (dep.required) {
            throw new Error(
              `Cannot install plugin '${pluginId}': required dependency '${dep.pluginId}' is not installed. ` +
                `Reason: ${dep.reason || 'Required for plugin functionality'}`
            );
          }
        } else {
          // Check version compatibility using semver
          const installedVersion = depInstalled.plugin.version;
          const requiredVersionRange = dep.version;

          if (!semver.satisfies(installedVersion, requiredVersionRange)) {
            throw new Error(
              `Cannot install plugin '${pluginId}': dependency '${dep.pluginId}' version mismatch. ` +
                `Required: ${requiredVersionRange}, installed: ${installedVersion}`
            );
          }
        }
      }
    }

    // Check old-style dependencies
    await this.checkDependencies(tenantId, manifest);

    // Create installation within transaction
    try {
      return await db.$transaction(async (tx) => {
        // Create installation
        const installation = await tx.tenantPlugin.create({
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

        // M2.3: Register services for this tenant
        if (manifest.api?.services) {
          for (const service of manifest.api.services) {
            try {
              await this.serviceRegistry.registerService({
                pluginId,
                tenantId,
                serviceName: service.name,
                version: service.version,
                baseUrl: service.baseUrl || `http://plugin-${pluginId}:8080`,
                endpoints: service.endpoints?.map((ep) => ({
                  method: ep.method,
                  path: ep.path,
                  description: ep.description,
                  permissions: ep.permissions,
                  metadata: ep.metadata,
                })),
                metadata: service.metadata,
              });
            } catch (error: any) {
              console.error(`Failed to register service '${service.name}':`, error.message);
            }
          }
        }

        // Run installation lifecycle hook if defined
        if (manifest.lifecycle?.install) {
          try {
            await this.runLifecycleHook(manifest, 'install', {
              tenantId,
              pluginId,
              configuration,
            });
          } catch (error: any) {
            // Transaction will automatically rollback on error
            throw new Error(`Plugin installation lifecycle hook failed: ${error.message}`);
          }
        }

        return installation;
      });
    } catch (error: any) {
      throw new Error(
        `Failed to install plugin: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
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
            // ReDoS protection: validate regex pattern and limit string length
            try {
              const pattern = field.validation.pattern;

              // Reject patterns with common ReDoS indicators
              this.validateRegexPattern(pattern);

              // Create regex with a safety timeout by limiting test string length
              const regex = new RegExp(pattern);
              const maxTestLength = 1000; // Limit test string to 1000 chars
              const testValue = value.substring(0, maxTestLength);

              if (!regex.test(testValue)) {
                throw new Error(
                  field.validation.message ||
                    `Configuration field '${field.key}' does not match required pattern`
                );
              }
            } catch (error: any) {
              if (error.message.includes('ReDoS') || error.message.includes('pattern')) {
                throw error;
              }
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
    // For now, silently skip
  }

  /**
   * Validate regex pattern for common ReDoS (Regular Expression Denial of Service) vulnerabilities
   * Rejects patterns with nested quantifiers, alternation with overlap, etc.
   */
  private validateRegexPattern(pattern: string): void {
    // Common ReDoS indicators to reject:
    // 1. Nested quantifiers: (a+)+ , (a*)*
    // 2. Alternation with overlap: (a|a)+ , (a|ab)+
    // 3. Multiple overlapping alternations: (a|a|a)+

    const redosPatterns = [
      /(\w\+)\+/, // nested + quantifier
      /(\w\*)\*/, // nested * quantifier
      /(\w\{[\d,]+\})\+/, // nested { } with +
      /\([^)]*\|[^)]*\)\+/, // alternation with +
      /\([^)]*\|[^)]*\)\*/, // alternation with *
    ];

    for (const redosPattern of redosPatterns) {
      if (redosPattern.test(pattern)) {
        throw new Error(
          `ReDoS vulnerability detected in regex pattern: ${pattern}. ` +
            `Patterns with nested quantifiers or overlapping alternations are not allowed.`
        );
      }
    }
  }
}

// Singleton instances
export const pluginRegistryService = new PluginRegistryService();
export const pluginLifecycleService = new PluginLifecycleService();
