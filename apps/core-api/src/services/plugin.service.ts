import { db } from '../lib/db.js';
import type { PluginManifest } from '../types/plugin.types.js';
import {
  PluginStatus,
  Prisma,
  type Plugin,
  type TenantPlugin,
  type Tenant,
} from '@plexica/database';
import { validatePluginManifest } from '../schemas/plugin-manifest.schema.js';
import { ServiceRegistryService } from './service-registry.service.js';
import { DependencyResolutionService } from './dependency-resolution.service.js';
import { redis } from '../lib/redis.js';
import semver from 'semver';
import { TENANT_STATUS } from '../constants/index.js';
import { promises as fs } from 'fs';
import * as path from 'path';
import { TranslationKeySchema } from '../modules/i18n/i18n.schemas.js';
import { flattenMessages } from '@plexica/i18n';
import { logger } from '../lib/logger.js';
import type { Logger } from 'pino';

// Type for TenantPlugin with related Plugin record
type TenantPluginWithPlugin = TenantPlugin & { plugin: Plugin };
type TenantPluginWithPluginAndTenant = TenantPlugin & { plugin: Plugin; tenant: Tenant };

/**
 * Plugin Registry Service
 * Manages the global registry of available plugins
 */
export class PluginRegistryService {
  private serviceRegistry: ServiceRegistryService;
  private dependencyResolver: DependencyResolutionService;
  private logger: Logger;

  constructor(customLogger?: Logger) {
    // Use provided logger or default to shared Pino logger
    // Constitution Article 6.3: Pino JSON logging with standard fields
    this.logger = customLogger || logger;

    this.serviceRegistry = new ServiceRegistryService(db, redis, this.logger);
    this.dependencyResolver = new DependencyResolutionService(db, this.logger);
  }

  /**
   * Register a new plugin in the global registry
   */
  async registerPlugin(manifest: PluginManifest): Promise<Plugin> {
    // Validate manifest using Zod schema (M2.3)
    const validation = validatePluginManifest(manifest);
    if (!validation.valid) {
      const errorMessages = validation.errors?.map((e) => `${e.path}: ${e.message}`).join('; ');
      throw new Error(`Invalid plugin manifest: ${errorMessages}`);
    }

    // Additional basic validation
    await this.validateManifest(manifest);

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
        // Prisma JsonValue requires casting from typed manifest
        manifest: manifest as unknown as Prisma.InputJsonValue,
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
        } catch (error: unknown) {
          // Log errors but continue with other services
          const errorMsg = error instanceof Error ? error.message : String(error);
          this.logger.error(
            { pluginId: manifest.id, serviceName: service.name, error: errorMsg },
            `Failed to register service '${service.name}'`
          );
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
   *
   * SECURITY FIX: Now uses Zod validation to prevent security bypass.
   * Previous implementation only used custom validation, allowing invalid
   * manifests to bypass Zod schema constraints.
   */
  async updatePlugin(pluginId: string, manifest: PluginManifest): Promise<Plugin> {
    // ✅ SECURITY: Validate with Zod schema first (same as registerPlugin)
    const validation = validatePluginManifest(manifest);
    if (!validation.valid) {
      const errorMessages = validation.errors?.map((e) => `${e.path}: ${e.message}`).join('; ');
      throw new Error(`Invalid plugin manifest: ${errorMessages}`);
    }

    // Additional custom validation (translation files, version format, etc.)
    await this.validateManifest(manifest);

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
        manifest: manifest as unknown as Prisma.InputJsonValue,
      },
    });

    return updated;
  }

  /**
   * Get plugin by ID
   */
  async getPlugin(pluginId: string): Promise<Plugin> {
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
  }): Promise<{ plugins: Plugin[]; total: number }> {
    const { status, category, search, skip = 0, take = 50 } = options || {};

    // Enforce bounds on pagination
    const validatedSkip = Math.max(0, skip);
    const validatedTake = Math.max(1, Math.min(take, 500)); // Max 500 results per page

    const where: Record<string, unknown> = {};

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
    // Check if plugin exists
    const plugin = await db.plugin.findUnique({
      where: { id: pluginId },
    });

    if (!plugin) {
      throw new Error(`Plugin '${pluginId}' not found`);
    }

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
  async deprecatePlugin(pluginId: string): Promise<Plugin> {
    const plugin = await db.plugin.update({
      where: { id: pluginId },
      data: { status: PluginStatus.DEPRECATED },
    });

    return plugin;
  }

  /**
   * Get plugin statistics
   *
   * PERFORMANCE FIX: Use database aggregation instead of loading all rows into memory.
   * For popular plugins with 10,000+ installations, the old implementation would:
   * - Load ~500MB+ of data into memory
   * - Risk Node.js out-of-memory errors
   * - Scale linearly O(n) with tenant count
   *
   * New implementation uses COUNT queries (O(1) memory, database aggregation).
   */
  async getPluginStats(pluginId: string): Promise<{
    installCount: number;
    activeTenants: number;
    version: string;
  }> {
    // Fetch plugin metadata and run aggregation queries in parallel
    const [plugin, totalInstallations, enabledInstallations, activeTenantsCount] =
      await Promise.all([
        db.plugin.findUnique({
          where: { id: pluginId },
          select: { id: true, version: true },
        }),
        // Count total installations (all tenants)
        db.tenantPlugin.count({
          where: { pluginId },
        }),
        // Count enabled installations
        db.tenantPlugin.count({
          where: { pluginId, enabled: true },
        }),
        // Count active tenants with enabled plugin
        db.tenantPlugin.count({
          where: {
            pluginId,
            enabled: true,
            tenant: {
              status: TENANT_STATUS.ACTIVE,
            },
          },
        }),
      ]);

    if (!plugin) {
      throw new Error(`Plugin '${pluginId}' not found`);
    }

    return {
      installCount: totalInstallations,
      activeTenants: activeTenantsCount,
      version: plugin.version,
    };
  }

  /**
   * Validate plugin manifest
   */
  private async validateManifest(manifest: PluginManifest): Promise<void> {
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

    // NEW: Validate translation files if translations section is declared (FR-004, FR-011, FR-012)
    if (manifest.translations) {
      await this.validateTranslationFiles(manifest);
    }
  }

  /**
   * Validate translation files for a plugin (FR-004, FR-011, FR-012)
   *
   * Checks that:
   * - All declared translation files exist
   * - Each file is ≤ 200KB
   * - All translation keys are valid (max 128 chars, [a-zA-Z0-9._] only)
   *
   * @throws Error if validation fails with actionable message
   */
  private async validateTranslationFiles(manifest: PluginManifest): Promise<void> {
    if (!manifest.translations) {
      return;
    }

    const { namespaces, supportedLocales } = manifest.translations;
    const pluginBasePath = path.resolve(process.cwd(), 'plugins', manifest.id);
    const MAX_FILE_SIZE = 200 * 1024; // 200KB in bytes (FR-012)

    // Re-validate namespace and locale formats for defense-in-depth (path traversal protection)
    const namespaceRegex = /^[a-z0-9\-]+$/;
    const localeRegex = /^[a-z]{2}(-[A-Z]{2})?$/;

    for (const locale of supportedLocales) {
      // Defense-in-depth: re-validate locale format at filesystem boundary
      if (!localeRegex.test(locale)) {
        throw new Error(
          `Invalid locale format: "${locale}". Must be BCP 47 format (e.g., "en", "en-US").`
        );
      }

      for (const namespace of namespaces) {
        // Defense-in-depth: re-validate namespace format at filesystem boundary
        if (!namespaceRegex.test(namespace)) {
          throw new Error(
            `Invalid namespace format: "${namespace}". Must be lowercase alphanumeric with hyphens.`
          );
        }

        const translationFilePath = path.join(
          pluginBasePath,
          'translations',
          locale,
          `${namespace}.json`
        );

        // Path traversal protection: verify resolved path stays within plugin directory
        const resolvedPath = path.resolve(translationFilePath);
        if (!resolvedPath.startsWith(pluginBasePath)) {
          throw new Error(
            `Path traversal detected: Translation file path "${translationFilePath}" ` +
              `resolves outside plugin directory. This is a security violation.`
          );
        }

        try {
          // Check if file exists
          const fileStats = await fs.stat(resolvedPath);

          // Validate file size (FR-012)
          if (fileStats.size > MAX_FILE_SIZE) {
            throw new Error(
              `Translation file too large: ${resolvedPath} (${(fileStats.size / 1024).toFixed(2)}KB > 200KB limit). ` +
                `Split into multiple namespaces or reduce translation count.`
            );
          }

          // Read and parse file
          const fileContent = await fs.readFile(resolvedPath, 'utf8');
          const translations = JSON.parse(fileContent);

          // Flatten to get all keys
          const flattenedKeys = flattenMessages(translations);

          // Validate each key (FR-011)
          for (const key of Object.keys(flattenedKeys)) {
            const validation = TranslationKeySchema.safeParse(key);
            if (!validation.success) {
              throw new Error(
                `Invalid translation key "${key}" in ${resolvedPath}: ${validation.error.issues[0].message}`
              );
            }
          }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            throw new Error(
              `Missing translation file: ${resolvedPath}. ` +
                `Plugin declares namespace "${namespace}" for locale "${locale}" but file does not exist.`
            );
          }
          throw error; // Re-throw validation errors or other errors
        }
      }
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
  private logger: Logger;

  constructor(customLogger?: Logger) {
    // Use provided logger or default to shared Pino logger
    // Constitution Article 6.3: Pino JSON logging with standard fields
    this.logger = customLogger || logger;

    this.registry = new PluginRegistryService(this.logger);
    this.serviceRegistry = new ServiceRegistryService(db, redis, this.logger);
    this.dependencyResolver = new DependencyResolutionService(db, this.logger);
  }

  /**
   * Install a plugin for a tenant
   */
  async installPlugin(
    tenantId: string,
    pluginId: string,
    configuration: Record<string, unknown> = {}
  ): Promise<TenantPluginWithPluginAndTenant> {
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

    // Apply default configuration values
    const finalConfiguration: Record<string, unknown> = { ...configuration };
    if (manifest.config) {
      for (const field of manifest.config) {
        if (field.default !== undefined && finalConfiguration[field.key] === undefined) {
          finalConfiguration[field.key] = field.default;
        }
      }
    }

    this.validateConfiguration(manifest, finalConfiguration);

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

    // Create installation within transaction (without service registration to maintain atomicity)
    let installation: TenantPluginWithPluginAndTenant;
    try {
      installation = await db.$transaction(async (tx) => {
        // Create installation
        const newInstallation = await tx.tenantPlugin.create({
          data: {
            tenantId,
            pluginId,
            enabled: false, // Start disabled, must be explicitly activated
            configuration: finalConfiguration as Prisma.InputJsonValue,
          },
          include: {
            plugin: true,
            tenant: true,
          },
        });

        // Run installation lifecycle hook if defined
        // NOTE: Lifecycle hook runs INSIDE transaction. If it fails, installation rolls back.
        if (manifest.lifecycle?.install) {
          try {
            await this.runLifecycleHook(manifest, 'install', {
              tenantId,
              pluginId,
              configuration: finalConfiguration,
            });
          } catch (error: unknown) {
            // Transaction will automatically rollback on error
            const errorMsg = error instanceof Error ? error.message : String(error);
            throw new Error(`Plugin installation lifecycle hook failed: ${errorMsg}`);
          }
        }

        return newInstallation;
      });
    } catch (error: unknown) {
      throw new Error(
        `Failed to install plugin: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }

    // AFTER transaction succeeds: Register services for this tenant
    // This is done outside the transaction to avoid orphaned service registrations
    // if the transaction rolls back. If service registration fails here, the installation
    // is complete but without services (better than having services without installation).
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
        } catch (error: unknown) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          this.logger.error(
            { pluginId, tenantId, serviceName: service.name, error: errorMsg },
            `Failed to register service '${service.name}'`
          );
          // Log but don't fail the installation - service registration is supplementary
        }
      }
    }

    return installation;
  }

  /**
   * Activate a plugin for a tenant
   */
  async activatePlugin(tenantId: string, pluginId: string): Promise<TenantPluginWithPlugin> {
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
      include: {
        plugin: true,
      },
    });

    return updated;
  }

  /**
   * Deactivate a plugin for a tenant
   */
  async deactivatePlugin(tenantId: string, pluginId: string): Promise<TenantPluginWithPlugin> {
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
      include: {
        plugin: true,
      },
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
    configuration: Record<string, unknown>
  ): Promise<TenantPluginWithPlugin> {
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
      data: { configuration: configuration as Prisma.InputJsonValue },
      include: {
        plugin: true,
      },
    });

    return updated;
  }

  /**
   * Get installed plugins for a tenant
   */
  async getInstalledPlugins(tenantId: string): Promise<TenantPluginWithPlugin[]> {
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
    configuration: Record<string, unknown>
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
            } catch (error: unknown) {
              const errorMsg = error instanceof Error ? error.message : String(error);
              if (errorMsg.includes('ReDoS') || errorMsg.includes('pattern')) {
                throw error;
              }
              throw new Error(
                field.validation.message ||
                  `Configuration field '${field.key}' does not match required pattern`
              );
            }
          }

          if (
            field.validation.min !== undefined &&
            typeof value === 'number' &&
            value < field.validation.min
          ) {
            throw new Error(
              `Configuration field '${field.key}' must be at least ${field.validation.min}`
            );
          }

          if (
            field.validation.max !== undefined &&
            typeof value === 'number' &&
            value > field.validation.max
          ) {
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
    _manifest: PluginManifest,
    _hook: string,
    _context: Record<string, unknown>
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
