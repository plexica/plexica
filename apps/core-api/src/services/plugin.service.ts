import { db } from '../lib/db.js';
import type { PluginManifest } from '../types/plugin.types.js';
import {
  PluginStatus,
  PluginLifecycleStatus,
  Prisma,
  type Plugin,
  type TenantPlugin,
  type Tenant,
} from '@plexica/database';
import { validatePluginManifest } from '../schemas/plugin-manifest.schema.js';
import { ServiceRegistryService } from './service-registry.service.js';
import { DependencyResolutionService } from './dependency-resolution.service.js';
import { tenantService } from './tenant.service.js';
import {
  permissionRegistrationService,
  type PluginPermissionInput,
} from '../modules/authorization/permission-registration.service.js';
import { redis } from '../lib/redis.js';
import semver from 'semver';
import { TENANT_STATUS } from '../constants/index.js';
import { promises as fs } from 'fs';
import * as path from 'path';
import { TranslationKeySchema } from '../modules/i18n/i18n.schemas.js';
import { flattenMessages } from '@plexica/i18n';
import { logger } from '../lib/logger.js';
import type { Logger } from 'pino';
import safeRegex from 'safe-regex2';
import {
  type ContainerAdapter,
  type ContainerConfig,
  createContainerAdapter,
} from '../lib/container-adapter.js';
import { TenantMigrationService } from './tenant-migration.service.js';
import { TopicManager } from '@plexica/event-bus';
import type { TranslationService } from '../modules/i18n/i18n.service.js';
import { moduleFederationRegistryService } from './module-federation-registry.service.js';

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
    lifecycleStatus?: PluginLifecycleStatus;
    category?: string;
    search?: string;
    skip?: number;
    take?: number;
  }): Promise<{ plugins: Plugin[]; total: number }> {
    const { status, lifecycleStatus, category, search, skip = 0, take = 50 } = options || {};

    // Enforce bounds on pagination
    const validatedSkip = Math.max(0, skip);
    const validatedTake = Math.max(1, Math.min(take, 500)); // Max 500 results per page

    const where: Record<string, unknown> = {};

    if (status) {
      where.status = status;
    }

    if (lifecycleStatus) {
      where.lifecycleStatus = lifecycleStatus;
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
    const [plugin, totalInstallations, _enabledInstallations, activeTenantsCount] =
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

/** Valid state-machine transitions for Plugin.lifecycleStatus (ADR-018) */
const VALID_TRANSITIONS: Record<PluginLifecycleStatus, PluginLifecycleStatus[]> = {
  [PluginLifecycleStatus.REGISTERED]: [PluginLifecycleStatus.INSTALLING],
  [PluginLifecycleStatus.INSTALLING]: [
    PluginLifecycleStatus.INSTALLED,
    PluginLifecycleStatus.REGISTERED,
  ],
  [PluginLifecycleStatus.INSTALLED]: [
    PluginLifecycleStatus.ACTIVE,
    PluginLifecycleStatus.UNINSTALLING,
  ],
  [PluginLifecycleStatus.ACTIVE]: [PluginLifecycleStatus.DISABLED],
  [PluginLifecycleStatus.DISABLED]: [
    PluginLifecycleStatus.ACTIVE,
    PluginLifecycleStatus.UNINSTALLING,
  ],
  [PluginLifecycleStatus.UNINSTALLING]: [
    PluginLifecycleStatus.UNINSTALLED,
    PluginLifecycleStatus.REGISTERED, // Reset to REGISTERED when last tenant uninstalls (allows reinstall)
    PluginLifecycleStatus.INSTALLED, // Revert to INSTALLED when other tenants still have the plugin installed
  ],
  [PluginLifecycleStatus.UNINSTALLED]: [PluginLifecycleStatus.REGISTERED], // Re-registration path
};

export class PluginLifecycleService {
  private registry: PluginRegistryService;
  private serviceRegistry: ServiceRegistryService;
  private dependencyResolver: DependencyResolutionService;
  private logger: Logger;
  private adapter: ContainerAdapter;
  private migrationService: TenantMigrationService;
  private topicManager: TopicManager | null;
  private translationService: TranslationService | null;

  constructor(
    customLogger?: Logger,
    adapter?: ContainerAdapter,
    migrationService?: TenantMigrationService,
    topicManager?: TopicManager | null,
    translationService?: TranslationService | null
  ) {
    // Use provided logger or default to shared Pino logger
    // Constitution Article 6.3: Pino JSON logging with standard fields
    this.logger = customLogger || logger;

    this.registry = new PluginRegistryService(this.logger);
    this.serviceRegistry = new ServiceRegistryService(db, redis, this.logger);
    this.dependencyResolver = new DependencyResolutionService(db, this.logger);
    // T004-08: ContainerAdapter — injected for tests, defaulting to env-selected adapter
    this.adapter = adapter ?? createContainerAdapter();
    // T004-08: TenantMigrationService — injected for tests
    this.migrationService = migrationService ?? new TenantMigrationService();
    // T004-12: TopicManager — optional, null means skip topic creation (fail-open)
    this.topicManager = topicManager !== undefined ? topicManager : null;
    // T004-14: TranslationService — optional, null means skip translation loading
    this.translationService = translationService !== undefined ? translationService : null;
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

    // Validate configuration and dependencies BEFORE any lifecycle transitions
    // so that failures don't leave the global lifecycle status stuck at INSTALLING.
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

    // Create installation within a single atomic transaction.
    //
    // SECURITY FIX (TOCTOU): The isFirstInstall determination, the REGISTERED→INSTALLING
    // lifecycle transition, and the tenantPlugin row creation are now all inside one
    // db.$transaction. This eliminates the race where two concurrent installPlugin()
    // calls could both see "no existing tenantPlugin" and both attempt the lifecycle
    // transition, leaving the global status stuck at INSTALLING.
    //
    // The outer findUnique check at line 558 is kept as an optimistic fast exit (no
    // lock held), but the authoritative uniqueness guard is the re-check inside the
    // transaction below.
    let installation: TenantPluginWithPluginAndTenant;
    let isFirstInstall: boolean;
    try {
      const txResult = await db.$transaction(async (tx) => {
        // TOCTOU-safe re-check: unique constraint is enforced inside the transaction.
        const alreadyInstalled = await tx.tenantPlugin.findUnique({
          where: { tenantId_pluginId: { tenantId, pluginId } },
        });
        if (alreadyInstalled) {
          throw new Error(`Plugin '${pluginId}' is already installed`);
        }

        // Determine first-install inside the transaction (TOCTOU-safe count).
        const installationCount = await tx.tenantPlugin.count({ where: { pluginId } });
        const firstInstall =
          installationCount === 0 || plugin.lifecycleStatus === PluginLifecycleStatus.REGISTERED;

        // Track whether this call is responsible for the REGISTERED→INSTALLING transition.
        // Re-evaluated inside the tx against the live lifecycleStatus to avoid a stale-read
        // race where two concurrent first-installs both see `installationCount === 0` but
        // only one may perform the lifecycle transition.
        let actualFirstInstall = firstInstall;

        if (firstInstall) {
          // Inline REGISTERED → INSTALLING transition (cannot call transitionLifecycleStatus
          // here because that method uses `db` directly; we need `tx` for atomicity).
          const currentPlugin = await tx.plugin.findUnique({
            where: { id: pluginId },
            select: { lifecycleStatus: true },
          });
          if (!currentPlugin) {
            throw new Error(`Plugin '${pluginId}' not found`);
          }

          if (currentPlugin.lifecycleStatus === PluginLifecycleStatus.INSTALLING) {
            // Another concurrent install is already performing the REGISTERED→INSTALLING
            // transition. This tenant's install is a subsequent install — skip the
            // lifecycle transition and let the concurrent call drive INSTALLING→INSTALLED.
            actualFirstInstall = false;
          } else {
            const allowed = VALID_TRANSITIONS[currentPlugin.lifecycleStatus] ?? [];
            if (!allowed.includes(PluginLifecycleStatus.INSTALLING)) {
              throw new Error(
                `Plugin '${pluginId}' cannot transition from ${currentPlugin.lifecycleStatus} to ${PluginLifecycleStatus.INSTALLING}`
              );
            }
            await tx.plugin.update({
              where: { id: pluginId },
              data: { lifecycleStatus: PluginLifecycleStatus.INSTALLING },
            });
          }
        }

        // Create the tenantPlugin row.
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

        // Installation lifecycle hook placeholder.
        // The manifest may declare a `lifecycle.install` handler; actual execution
        // (loading plugin code and calling the handler) is deferred to a future task.
        // The check is preserved so the manifest field is not silently ignored.
        if (manifest.lifecycle?.install) {
          this.logger.debug(
            { pluginId, hook: 'install' },
            'Plugin lifecycle hook declared but execution is not yet implemented'
          );
        }

        return { installation: newInstallation, isFirstInstall: actualFirstInstall };
      });

      installation = txResult.installation;
      isFirstInstall = txResult.isFirstInstall;

      // Transition lifecycle: INSTALLING → INSTALLED (first install only).
      // This runs after the transaction commits — a failure here is logged but
      // does not need manual rollback because the INSTALLING transition was part
      // of the committed transaction and will be visible as-is until a retry.
      if (isFirstInstall) {
        await this.transitionLifecycleStatus(pluginId, PluginLifecycleStatus.INSTALLED);
      }
    } catch (error: unknown) {
      // The INSTALLING transition was inside the transaction, so it auto-rolled
      // back on failure. No manual lifecycle rollback is required here.
      throw new Error(
        `Failed to install plugin: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }

    // T004-08: Run per-tenant schema migrations AFTER transaction succeeds.
    // Each tenant's migration runs in an isolated transaction; one failure does not
    // block other tenants. If ALL tenants fail (or a critical error), rollback
    // lifecycleStatus to REGISTERED and re-throw.
    try {
      const migrationResults = await this.migrationService.runPluginMigrations(
        pluginId,
        // Migrations are sourced from the plugin package assets; for now pass
        // an empty array so the service contract is satisfied — a future task
        // will wire manifest.migrations into this array.
        []
      );
      const failures = migrationResults.filter((r) => !r.success);
      if (failures.length > 0) {
        this.logger.warn(
          { pluginId, failures: failures.map((f) => ({ tenantId: f.tenantId, error: f.error })) },
          'Plugin migrations failed for some tenants'
        );
        // Non-blocking for partial failures: the plugin is still installed globally.
        // Tenants with failed migrations will be in a degraded state until fixed.
      }
    } catch (migrationError: unknown) {
      // Catastrophic migration failure — rollback lifecycleStatus
      try {
        await this.transitionLifecycleStatus(pluginId, PluginLifecycleStatus.REGISTERED);
      } catch {
        /* swallow rollback errors */
      }
      throw new Error(
        `Plugin installation failed during migrations: ${
          migrationError instanceof Error ? migrationError.message : String(migrationError)
        }`
      );
    }

    // AFTER transaction succeeds: Register plugin permissions (FR-011, FR-012)
    // Done outside the transaction so that a permission conflict aborts install cleanly.
    // Edge Case #4: if registerPluginPermissions throws PERMISSION_KEY_CONFLICT, we
    // must undo the DB installation and re-throw so the caller gets an actionable error.
    if (manifest.permissions && manifest.permissions.length > 0) {
      const tenant = await db.tenant.findUnique({
        where: { id: tenantId },
        select: { slug: true },
      });
      if (tenant) {
        const schemaName = tenantService.getSchemaName(tenant.slug);
        const permInputs: PluginPermissionInput[] = manifest.permissions.map((p) => ({
          key: `${p.resource}:${p.action}`,
          name: `${p.resource} ${p.action}`,
          description: p.description,
        }));

        try {
          await permissionRegistrationService.registerPluginPermissions(
            tenantId,
            schemaName,
            pluginId,
            permInputs
          );
        } catch (permError: unknown) {
          // Rollback: remove the tenantPlugin row we just created
          try {
            await db.tenantPlugin.delete({ where: { tenantId_pluginId: { tenantId, pluginId } } });
          } catch (rollbackErr: unknown) {
            const rollbackMsg =
              rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr);
            this.logger.error(
              { tenantId, pluginId, error: rollbackMsg },
              'Failed to rollback tenantPlugin after permission conflict'
            );
          }
          // T004-05: Also reset lifecycleStatus to REGISTERED on permission conflict
          try {
            await db.plugin.update({
              where: { id: pluginId },
              data: { lifecycleStatus: PluginLifecycleStatus.REGISTERED },
            });
          } catch (lcRollbackErr: unknown) {
            this.logger.error(
              {
                pluginId,
                error:
                  lcRollbackErr instanceof Error ? lcRollbackErr.message : String(lcRollbackErr),
              },
              'Failed to rollback lifecycleStatus to REGISTERED after permission conflict'
            );
          }
          throw permError;
        }
      }
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

    // T004-13: Register Module Federation remote entry if manifest declares one.
    // Fail-open — a missing remote entry URL is not fatal for installation; the
    // plugin container will run without a frontend module federation entry.
    // The warning below includes alert:'mf_remote_entry_registration_failed' so that
    // log-based monitoring can count occurrences and alert on repeated failures.
    if (manifest.frontend?.remoteEntry) {
      try {
        await moduleFederationRegistryService.registerRemoteEntry(
          pluginId,
          manifest.frontend.remoteEntry,
          manifest.frontend.routePrefix ?? null
        );
      } catch (mfErr: unknown) {
        this.logger.warn(
          {
            pluginId,
            remoteEntry: manifest.frontend.remoteEntry,
            error: mfErr instanceof Error ? mfErr.message : String(mfErr),
            // Structured alert key — ops monitoring should count occurrences
            // of this field and alert when the rate exceeds a threshold.
            alert: 'mf_remote_entry_registration_failed',
          },
          'T004-13: Failed to register Module Federation remote entry (non-blocking) — plugin installed but frontend module will not be available'
        );
      }
    }

    return installation;
  }

  /**
   * Activate a plugin for a tenant (super-admin global enable).
   * T004-08: Starts the container, polls health, then transitions to ACTIVE.
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
    const containerConfig = this.buildContainerConfig(manifest);

    // T004-08: Start container
    await this.adapter.start(pluginId, containerConfig);

    // T004-08: Poll health for up to 5s (every 500ms)
    const healthy = await this.pollHealth(pluginId, 5000, 500);
    if (!healthy) {
      // Health check failed — stop container and rollback lifecycle
      try {
        await this.adapter.stop(pluginId);
      } catch (stopErr: unknown) {
        this.logger.error(
          { pluginId, error: stopErr instanceof Error ? stopErr.message : String(stopErr) },
          'Failed to stop container after health check timeout'
        );
      }
      throw new Error(`Plugin '${pluginId}' failed health check after enable`);
    }

    // T004-12: Create Redpanda event topics (fail-open — topic creation failure does not abort enable)
    if (this.topicManager && manifest.events) {
      const allEvents = [
        ...(manifest.events.publishes ?? []),
        ...(manifest.events.subscribes ?? []),
      ];
      for (const eventName of allEvents) {
        const topicName = this.topicManager.buildPluginTopicName(pluginId, eventName);
        try {
          await this.topicManager.createTopic(topicName);
        } catch (topicErr: unknown) {
          this.logger.warn(
            {
              pluginId,
              topicName,
              error: topicErr instanceof Error ? topicErr.message : String(topicErr),
            },
            'T004-12: Failed to create Redpanda topic (non-blocking, plugin will run in degraded mode)'
          );
        }
      }
    }

    // T004-14: Load translation namespaces (fail-open — missing files do not abort enable)
    if (this.translationService && manifest.translations) {
      const { namespaces, supportedLocales } = manifest.translations;
      for (const namespace of namespaces) {
        for (const locale of supportedLocales) {
          try {
            await this.translationService.loadNamespaceFile(locale, namespace);
          } catch (translationErr: unknown) {
            this.logger.warn(
              {
                pluginId,
                namespace,
                locale,
                error:
                  translationErr instanceof Error ? translationErr.message : String(translationErr),
              },
              'T004-14: Failed to load translation namespace file (non-blocking)'
            );
          }
        }
      }
    }

    // Transition lifecycle: INSTALLED → ACTIVE (skip if already ACTIVE from another tenant)
    const currentPlugin = await db.plugin.findUnique({
      where: { id: pluginId },
      select: { lifecycleStatus: true },
    });
    if (currentPlugin?.lifecycleStatus !== PluginLifecycleStatus.ACTIVE) {
      await this.transitionLifecycleStatus(pluginId, PluginLifecycleStatus.ACTIVE);
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
   * Deactivate a plugin for a tenant (super-admin global disable).
   * T004-08: Transitions to DISABLED then stops the container.
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

    // SECURITY FIX (TOCTOU): The `otherEnabled` count, the ACTIVE→DISABLED lifecycle
    // transition, and the tenantPlugin disable are wrapped in a single $transaction.
    // Without this, two concurrent deactivatePlugin() calls could both read
    // otherEnabled === 0 and both attempt the transition, causing the second to
    // fail with an invalid-transition error (DISABLED→DISABLED).
    const shouldStopContainer = await db.$transaction(async (tx) => {
      // TOCTOU-safe re-check: confirm this tenant's plugin is still enabled.
      const currentInstallation = await tx.tenantPlugin.findUnique({
        where: { tenantId_pluginId: { tenantId, pluginId } },
        select: { enabled: true },
      });
      if (!currentInstallation) {
        throw new Error(`Plugin '${pluginId}' is not installed`);
      }
      if (!currentInstallation.enabled) {
        throw new Error(`Plugin '${pluginId}' is already inactive`);
      }

      // Count other enabled tenants inside the transaction for a consistent view.
      const otherEnabled = await tx.tenantPlugin.count({
        where: {
          pluginId,
          tenantId: { not: tenantId },
          enabled: true,
        },
      });

      const isLastEnabledTenant = otherEnabled === 0;

      if (isLastEnabledTenant) {
        // Inline ACTIVE → DISABLED transition (use tx, not db, for atomicity).
        const currentPlugin = await tx.plugin.findUnique({
          where: { id: pluginId },
          select: { lifecycleStatus: true },
        });
        if (!currentPlugin) {
          throw new Error(`Plugin '${pluginId}' not found`);
        }
        const allowed = VALID_TRANSITIONS[currentPlugin.lifecycleStatus] ?? [];
        if (!allowed.includes(PluginLifecycleStatus.DISABLED)) {
          throw new Error(
            `Plugin '${pluginId}' cannot transition from ${currentPlugin.lifecycleStatus} to ${PluginLifecycleStatus.DISABLED}`
          );
        }
        await tx.plugin.update({
          where: { id: pluginId },
          data: { lifecycleStatus: PluginLifecycleStatus.DISABLED },
        });
      }

      // Mark this tenant's plugin as disabled (inside the transaction).
      await tx.tenantPlugin.update({
        where: { tenantId_pluginId: { tenantId, pluginId } },
        data: { enabled: false },
      });

      return isLastEnabledTenant;
    });

    // T004-08: Stop container only if this was the last enabled tenant.
    // Runs AFTER the transaction commits — a failure here is non-blocking
    // because the plugin is already marked DISABLED in the DB.
    if (shouldStopContainer) {
      try {
        await this.adapter.stop(pluginId);
      } catch (stopErr: unknown) {
        this.logger.error(
          { pluginId, error: stopErr instanceof Error ? stopErr.message : String(stopErr) },
          'Failed to stop container during deactivation (non-blocking)'
        );
        // Non-blocking: plugin is already DISABLED in DB
      }
    }

    // Re-fetch with the plugin include for the return value.
    const updated = await db.tenantPlugin.findUniqueOrThrow({
      where: {
        tenantId_pluginId: { tenantId, pluginId },
      },
      include: {
        plugin: true,
      },
    });

    return updated;
  }

  /**
   * Uninstall a plugin from a tenant.
   * T004-08: Removes the container between UNINSTALLING and UNINSTALLED transitions.
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

    // Transition lifecycle: (INSTALLED|DISABLED) → UNINSTALLING
    await this.transitionLifecycleStatus(pluginId, PluginLifecycleStatus.UNINSTALLING);

    // T004-08: Remove container between UNINSTALLING and UNINSTALLED
    try {
      await this.adapter.remove(pluginId);
    } catch (removeErr: unknown) {
      this.logger.error(
        { pluginId, error: removeErr instanceof Error ? removeErr.message : String(removeErr) },
        'Failed to remove container during uninstall (non-blocking)'
      );
      // Non-blocking: proceed with cleanup
    }

    // Remove plugin permissions (FR-013) before deleting the installation row
    const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } });
    if (tenant) {
      const schemaName = tenantService.getSchemaName(tenant.slug);
      try {
        await permissionRegistrationService.removePluginPermissions(tenantId, schemaName, pluginId);
      } catch (permError: unknown) {
        const permMsg = permError instanceof Error ? permError.message : String(permError);
        this.logger.error(
          { tenantId, pluginId, error: permMsg },
          'Failed to remove plugin permissions during uninstall (non-blocking)'
        );
        // Non-blocking: proceed with uninstall even if permission cleanup fails
      }
    }

    // Remove installation
    await db.tenantPlugin.delete({
      where: {
        tenantId_pluginId: { tenantId, pluginId },
      },
    });

    // Check if any other tenants still have this plugin installed.
    // The lifecycleStatus column lives on the global Plugin record, so we must
    // only mutate it when the last tenant-installation is removed.  Transitioning
    // to UNINSTALLED would prevent reinstallation (state machine dead-end); instead
    // we reset to REGISTERED so the plugin remains available for future installs.
    const remainingInstallations = await db.tenantPlugin.count({
      where: { pluginId },
    });

    if (remainingInstallations === 0) {
      // Last tenant uninstalled — reset global lifecycle to REGISTERED so the
      // plugin can be installed again (by this or another tenant).
      await this.transitionLifecycleStatus(pluginId, PluginLifecycleStatus.REGISTERED);
    } else {
      // Other tenants still have this plugin installed — revert UNINSTALLING → INSTALLED
      // so the global lifecycle status reflects the actual deployment state.
      await this.transitionLifecycleStatus(pluginId, PluginLifecycleStatus.INSTALLED);
    }
  }

  /**
   * Enable a plugin for a specific tenant (tenant-admin level).
   * Does NOT start a container — that is super-admin only.
   * Requires the plugin's lifecycleStatus to be ACTIVE.
   * T004-10: Used by tenant-plugins-v1 routes.
   */
  async enableForTenant(tenantId: string, pluginId: string): Promise<TenantPluginWithPlugin> {
    // Verify plugin is globally active before allowing tenant enable
    const plugin = await db.plugin.findUnique({
      where: { id: pluginId },
      select: { lifecycleStatus: true },
    });

    if (!plugin) {
      throw new Error(`Plugin '${pluginId}' not found`);
    }

    if (plugin.lifecycleStatus !== PluginLifecycleStatus.ACTIVE) {
      const err = new Error(
        `Plugin '${pluginId}' must be globally enabled first (current: ${plugin.lifecycleStatus})`
      );
      (err as Error & { code: string }).code = 'PLUGIN_NOT_GLOBALLY_ACTIVE';
      throw err;
    }

    const installation = await db.tenantPlugin.findUnique({
      where: { tenantId_pluginId: { tenantId, pluginId } },
      include: { plugin: true },
    });

    if (!installation) {
      throw new Error(`Plugin '${pluginId}' is not installed for this tenant`);
    }

    if (installation.enabled) {
      throw new Error(`Plugin '${pluginId}' is already enabled for this tenant`);
    }

    return db.tenantPlugin.update({
      where: { tenantId_pluginId: { tenantId, pluginId } },
      data: { enabled: true },
      include: { plugin: true },
    });
  }

  /**
   * Disable a plugin for a specific tenant (tenant-admin level).
   * Preserves configuration data; does NOT stop the container.
   * T004-10: Used by tenant-plugins-v1 routes.
   */
  async disableForTenant(tenantId: string, pluginId: string): Promise<TenantPluginWithPlugin> {
    const installation = await db.tenantPlugin.findUnique({
      where: { tenantId_pluginId: { tenantId, pluginId } },
      include: { plugin: true },
    });

    if (!installation) {
      throw new Error(`Plugin '${pluginId}' is not installed for this tenant`);
    }

    if (!installation.enabled) {
      throw new Error(`Plugin '${pluginId}' is already disabled for this tenant`);
    }

    return db.tenantPlugin.update({
      where: { tenantId_pluginId: { tenantId, pluginId } },
      data: { enabled: false },
      include: { plugin: true },
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

        // Validate version compatibility using semver
        const installedVersion = installation.plugin.version;
        if (!semver.satisfies(installedVersion, _version)) {
          throw new Error(
            `Incompatible dependency version: Plugin '${depId}' requires version ${_version}, ` +
              `but installed version is ${installedVersion}`
          );
        }
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
   * Validate and apply a lifecycle state transition on the global Plugin record.
   * Throws if the transition is not permitted by the state machine (ADR-018).
   */
  private async transitionLifecycleStatus(
    pluginId: string,
    target: PluginLifecycleStatus
  ): Promise<void> {
    const plugin = await db.plugin.findUnique({
      where: { id: pluginId },
      select: { lifecycleStatus: true },
    });

    if (!plugin) {
      throw new Error(`Plugin '${pluginId}' not found`);
    }

    const current = plugin.lifecycleStatus;
    const allowed = VALID_TRANSITIONS[current] ?? [];

    if (!allowed.includes(target)) {
      throw new Error(`Plugin '${pluginId}' cannot transition from ${current} to ${target}`);
    }

    await db.plugin.update({
      where: { id: pluginId },
      data: { lifecycleStatus: target },
    });
  }

  /**
   * Poll container health until 'healthy' or timeout expires.
   *
   * @param pluginId  - plugin whose container is being polled
   * @param timeoutMs - total time to wait before giving up (ms)
   * @param intervalMs - interval between health polls (ms)
   * @returns true if 'healthy' was reached before the deadline, false otherwise
   */
  protected async pollHealth(
    pluginId: string,
    timeoutMs: number,
    intervalMs: number
  ): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const status = await this.adapter.health(pluginId);
      if (status === 'healthy') return true;
      // Wait before polling again (only if we still have time left)
      if (Date.now() + intervalMs < deadline) {
        await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
      } else {
        break;
      }
    }
    return false;
  }

  /**
   * Build a ContainerConfig from a plugin's manifest runtime settings.
   *
   * Reads `manifest.runtime.image`, `manifest.runtime.resources`, and
   * `manifest.runtime.env`. Falls back to a conventional image name if the
   * manifest does not declare a runtime section.
   */
  protected buildContainerConfig(manifest: PluginManifest): ContainerConfig {
    // PluginManifest does not currently type the `runtime` section — access it
    // defensively via an unknown cast until the manifest types are extended.
    const runtime = (
      manifest as unknown as {
        runtime?: {
          image?: string;
          resources?: { cpu?: string; memory?: string };
          env?: Record<string, string>;
        };
      }
    ).runtime;

    return {
      image: runtime?.image ?? `plexica/plugin-${manifest.id}:${manifest.version}`,
      env: runtime?.env,
      resources: runtime?.resources,
    };
  }

  /**
   * Validate regex pattern for common ReDoS (Regular Expression Denial of Service) vulnerabilities
   * Uses safe-regex2 library for static analysis of regex patterns
   */
  private validateRegexPattern(pattern: string): void {
    // Use safe-regex2 for comprehensive static analysis
    // Detects nested quantifiers, excessive backtracking, overlapping alternations, etc.
    if (!safeRegex(pattern)) {
      throw new Error(
        `ReDoS vulnerability detected in regex pattern: "${pattern}". ` +
          'This pattern may cause excessive backtracking and denial of service. ' +
          'Avoid nested quantifiers (e.g., (a+)+, (a*)*), overlapping alternations (e.g., (a|ab)+), ' +
          'and patterns with exponential complexity. ' +
          'See plugin development documentation for safe regex patterns.'
      );
    }
  }
}

// Singleton instances
export const pluginRegistryService = new PluginRegistryService();
export const pluginLifecycleService = new PluginLifecycleService();
