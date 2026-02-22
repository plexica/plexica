import { PrismaClient, TenantStatus, type Tenant } from '@plexica/database';
import { keycloakService } from './keycloak.service.js';
import { db } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { redis } from '../lib/redis.js';
import { getMinioClient } from './minio-client.js';
import { ProvisioningOrchestrator, type ProvisioningContext } from './provisioning-orchestrator.js';
import {
  SchemaStep,
  KeycloakRealmStep,
  KeycloakClientsStep,
  KeycloakRolesStep,
  MinioBucketStep,
  AdminUserStep,
  InvitationStep,
} from './provisioning-steps/index.js';

export interface CreateTenantInput {
  slug: string;
  name: string;
  adminEmail: string;
  settings?: Record<string, any>;
  theme?: Record<string, any>;
  pluginIds?: string[];
}

export interface UpdateTenantInput {
  name?: string;
  status?: TenantStatus;
  settings?: Record<string, any>;
  theme?: Record<string, any>;
}

export class TenantService {
  private db: PrismaClient;
  private orchestrator: ProvisioningOrchestrator;

  constructor(dbClient?: PrismaClient) {
    this.db = dbClient ?? db;
    this.orchestrator = new ProvisioningOrchestrator(this.db);
  }

  /**
   * Validate tenant slug to prevent SQL injection
   */
  private validateSlug(slug: string): void {
    // 3-64 chars, must start with a letter, end with alphanumeric, no leading/trailing hyphens
    const slugPattern = /^[a-z][a-z0-9-]{1,62}[a-z0-9]$/;
    if (!slugPattern.test(slug)) {
      throw new Error(
        'Tenant slug must be 3-64 chars, start with a lowercase letter, end with alphanumeric, and contain only lowercase letters, digits, and hyphens'
      );
    }
  }

  /**
   * Get the schema name for a tenant
   */
  getSchemaName(slug: string): string {
    return `tenant_${slug.replace(/-/g, '_')}`;
  }

  /**
   * Create a new tenant with full provisioning via ProvisioningOrchestrator (ADR-015).
   *
   * Steps: schema → keycloak realm → keycloak clients → keycloak roles →
   *        minio bucket → admin user → invitation email
   */
  async createTenant(input: CreateTenantInput): Promise<Tenant> {
    const { slug, name, adminEmail, settings = {}, theme = {}, pluginIds = [] } = input;

    // Validate slug format
    this.validateSlug(slug);

    // Create tenant record (status: PROVISIONING)
    let tenant;
    try {
      tenant = await this.db.tenant.create({
        data: {
          slug,
          name,
          status: TenantStatus.PROVISIONING,
          settings,
          theme,
        },
      });
    } catch (error: any) {
      const errorMessage = error?.message?.toString() || '';
      const errorString = error?.toString?.() || '';
      if (
        error.code === 'P2002' ||
        errorMessage.includes('Unique constraint failed') ||
        errorString.includes('Unique constraint failed')
      ) {
        throw new Error(`Tenant with slug '${slug}' already exists`);
      }
      throw error;
    }

    const context: ProvisioningContext = {
      tenantId: tenant.id,
      tenantSlug: slug,
      adminEmail,
      pluginIds,
    };

    const steps = [
      new SchemaStep(this.db, slug),
      new KeycloakRealmStep(slug, name),
      new KeycloakClientsStep(slug),
      new KeycloakRolesStep(slug),
      new MinioBucketStep(slug),
      new AdminUserStep(slug, adminEmail),
      new InvitationStep(slug, adminEmail, tenant.id, this.db),
    ];

    const result = await this.orchestrator.provision(context, steps);

    if (!result.success) {
      // Keep PROVISIONING status with error stored by orchestrator
      throw new Error(`Failed to provision tenant: ${result.error}`);
    }

    // Install initial plugins if requested (T001-09)
    if (pluginIds.length > 0) {
      for (const pluginId of pluginIds) {
        try {
          await this.installPlugin(tenant.id, pluginId);
        } catch (err) {
          logger.warn(
            { tenantId: tenant.id, pluginId, error: err },
            'Plugin install failed during provisioning (non-blocking)'
          );
        }
      }
    }

    // Update tenant status to ACTIVE
    const activeTenant = await this.db.tenant.update({
      where: { id: tenant.id },
      data: { status: TenantStatus.ACTIVE },
    });

    return activeTenant;
  }

  /**
   * Get tenant by ID
   */
  async getTenant(id: string): Promise<any> {
    const tenant = await this.db.tenant.findUnique({
      where: { id },
      include: {
        plugins: {
          include: {
            plugin: true,
          },
        },
      },
    });

    if (!tenant) {
      throw new Error('Tenant not found');
    }

    return tenant;
  }

  /**
   * Get tenant by slug
   */
  async getTenantBySlug(slug: string): Promise<any> {
    const tenant = await this.db.tenant.findUnique({
      where: { slug },
      include: {
        plugins: {
          include: {
            plugin: true,
          },
        },
      },
    });

    if (!tenant) {
      throw new Error('Tenant not found');
    }

    return tenant;
  }

  /**
   * List all tenants with pagination
   */
  async listTenants(options?: {
    skip?: number;
    take?: number;
    status?: TenantStatus;
    search?: string;
  }): Promise<{ tenants: any[]; total: number }> {
    const { skip = 0, take = 50, status, search } = options || {};

    // Build where clause with optional filters
    const where: any = {};

    if (status) {
      where.status = status;
    }

    if (search) {
      // Search in name or slug using case-insensitive contains
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [tenants, total] = await Promise.all([
      this.db.tenant.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          plugins: {
            include: {
              plugin: true,
            },
          },
        },
      }),
      this.db.tenant.count({ where }),
    ]);

    return { tenants, total };
  }

  /**
   * Update tenant information
   */
  async updateTenant(id: string, input: UpdateTenantInput): Promise<any> {
    const tenant = await this.db.tenant.findUnique({
      where: { id },
    });

    if (!tenant) {
      throw new Error('Tenant not found');
    }

    const updated = await this.db.tenant.update({
      where: { id },
      data: {
        name: input.name,
        status: input.status,
        settings: input.settings,
        theme: input.theme,
      },
    });

    return updated;
  }

  /**
   * Suspend a tenant.
   * Only ACTIVE tenants may be suspended — prevents corrupting the lifecycle state machine.
   * PROVISIONING, PENDING_DELETION, DELETED, and already-SUSPENDED tenants are rejected.
   */
  async suspendTenant(id: string): Promise<Tenant> {
    const tenant = await this.db.tenant.findUnique({ where: { id } });

    if (!tenant) {
      throw new Error('Tenant not found');
    }

    if (tenant.status !== TenantStatus.ACTIVE) {
      throw new Error(`Cannot suspend tenant with status: ${tenant.status}`);
    }

    return this.db.tenant.update({
      where: { id },
      data: { status: TenantStatus.SUSPENDED },
    });
  }

  /**
   * Delete tenant (soft delete: PENDING_DELETION + schedule hard delete in 30 days).
   * Only ACTIVE and SUSPENDED tenants may be soft-deleted.
   */
  async deleteTenant(id: string): Promise<{ deletionScheduledAt: Date }> {
    const tenant = await this.db.tenant.findUnique({ where: { id } });

    if (!tenant) {
      throw new Error('Tenant not found');
    }

    // State machine guard: only allow deletion from lifecycle-valid states
    // DELETED tenants are invisible — treat as not found (returns 404 to caller)
    if (tenant.status === TenantStatus.DELETED) {
      throw new Error('Tenant not found');
    }
    if (
      tenant.status === TenantStatus.PENDING_DELETION ||
      tenant.status === TenantStatus.PROVISIONING
    ) {
      throw new Error(`Cannot delete tenant with status: ${tenant.status}`);
    }

    const deletionScheduledAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // +30 days

    await this.db.tenant.update({
      where: { id },
      data: {
        status: TenantStatus.PENDING_DELETION,
        deletionScheduledAt,
      },
    });

    return { deletionScheduledAt };
  }

  /**
   * Activate / reactivate a tenant.
   * - PENDING_DELETION → SUSPENDED (clears deletionScheduledAt)
   * - SUSPENDED → ACTIVE
   */
  async activateTenant(id: string): Promise<Tenant> {
    const tenant = await this.db.tenant.findUnique({ where: { id } });

    if (!tenant) {
      throw new Error('Tenant not found');
    }

    let newStatus: TenantStatus;
    let clearDeletion = false;

    if (tenant.status === TenantStatus.PENDING_DELETION) {
      newStatus = TenantStatus.SUSPENDED;
      clearDeletion = true;
    } else if (tenant.status === TenantStatus.SUSPENDED) {
      newStatus = TenantStatus.ACTIVE;
    } else {
      throw new Error(`Cannot activate tenant with status: ${tenant.status}`);
    }

    return this.db.tenant.update({
      where: { id },
      data: {
        status: newStatus,
        ...(clearDeletion ? { deletionScheduledAt: null } : {}),
      },
    });
  }

  /**
   * Hard delete tenant and all associated resources
   * WARNING: This permanently deletes all tenant data
   *
   * Cleanup order: Keycloak → MinIO bucket → Redis keys → PostgreSQL schema → DB record
   */
  async hardDeleteTenant(id: string): Promise<void> {
    const tenant = await this.db.tenant.findUnique({
      where: { id },
    });

    if (!tenant) {
      throw new Error('Tenant not found');
    }

    // Validate tenant slug before using in SQL
    this.validateSlug(tenant.slug);

    const schemaName = this.getSchemaName(tenant.slug);

    // 1. Delete Keycloak realm
    try {
      await keycloakService.deleteRealm(tenant.slug);
    } catch (err) {
      logger.warn(
        { tenantId: id, slug: tenant.slug, error: err },
        'Keycloak realm deletion failed (continuing)'
      );
    }

    // 2. Remove per-tenant MinIO bucket (FR-007: complete data removal)
    try {
      await getMinioClient().removeTenantBucket(tenant.slug);
    } catch (err) {
      logger.warn(
        { tenantId: id, slug: tenant.slug, error: err },
        'MinIO bucket removal failed (continuing)'
      );
    }

    // 3. Remove all Redis keys belonging to this tenant (FR-007)
    try {
      const pattern = `tenant:${tenant.slug}:*`;
      let cursor = '0';
      do {
        const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = nextCursor;
        if (keys.length > 0) {
          await redis.del(...keys);
        }
      } while (cursor !== '0');
    } catch (err) {
      logger.warn(
        { tenantId: id, slug: tenant.slug, error: err },
        'Redis key cleanup failed (continuing)'
      );
    }

    try {
      // 4. Drop PostgreSQL schema
      await this.db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);

      // 5. Delete tenant record
      await this.db.tenant.delete({
        where: { id },
      });
    } catch (error) {
      throw new Error(
        `Failed to delete tenant: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Install a plugin for a tenant
   */
  async installPlugin(
    tenantId: string,
    pluginId: string,
    configuration: Record<string, any> = {}
  ): Promise<any> {
    const tenant = await this.db.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new Error('Tenant not found');
    }

    const plugin = await this.db.plugin.findUnique({
      where: { id: pluginId },
    });

    if (!plugin) {
      throw new Error('Plugin not found');
    }

    // Check if already installed
    const existing = await this.db.tenantPlugin.findUnique({
      where: {
        tenantId_pluginId: {
          tenantId,
          pluginId,
        },
      },
    });

    if (existing) {
      throw new Error('Plugin already installed for this tenant');
    }

    const tenantPlugin = await this.db.tenantPlugin.create({
      data: {
        tenantId,
        pluginId,
        enabled: true,
        configuration,
      },
      include: {
        plugin: true,
      },
    });

    return tenantPlugin;
  }

  /**
   * Uninstall a plugin from a tenant
   */
  async uninstallPlugin(tenantId: string, pluginId: string): Promise<void> {
    await this.db.tenantPlugin.delete({
      where: {
        tenantId_pluginId: {
          tenantId,
          pluginId,
        },
      },
    });
  }
}

// Singleton instance
export const tenantService = new TenantService();
