import { PrismaClient, TenantStatus } from '@plexica/database';
import { keycloakService } from './keycloak.service.js';
import { permissionService } from './permission.service.js';
import { db } from '../lib/db.js';
import { logger } from '../lib/logger.js';

export interface CreateTenantInput {
  slug: string;
  name: string;
  settings?: Record<string, any>;
  theme?: Record<string, any>;
}

export interface UpdateTenantInput {
  name?: string;
  status?: TenantStatus;
  settings?: Record<string, any>;
  theme?: Record<string, any>;
}

export class TenantService {
  private db: PrismaClient;

  constructor() {
    this.db = db;
  }

  /**
   * Validate tenant slug to prevent SQL injection
   */
  private validateSlug(slug: string): void {
    const slugPattern = /^[a-z0-9-]{1,50}$/;
    if (!slugPattern.test(slug)) {
      throw new Error('Tenant slug must be 1-50 chars, lowercase alphanumeric with hyphens only');
    }
  }

  /**
   * Get the schema name for a tenant
   */
  getSchemaName(slug: string): string {
    return `tenant_${slug.replace(/-/g, '_')}`;
  }

  /**
   * Create a new tenant with full provisioning
   *
   * This includes:
   * 1. Creating the tenant record in the database
   * 2. Creating a dedicated PostgreSQL schema for the tenant
   * 3. Creating a Keycloak realm for authentication
   * 4. Setting up MinIO bucket for storage (future)
   */
  async createTenant(input: CreateTenantInput): Promise<any> {
    const { slug, name, settings = {}, theme = {} } = input;

    // Validate slug format
    this.validateSlug(slug);

    // Attempt to create tenant with unique constraint
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
      // Handle unique constraint violation
      // Prisma error code P2002 indicates unique constraint failure
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

    try {
      // Step 1: Create PostgreSQL schema for tenant
      await this.createTenantSchema(slug);

      // Step 2: Create Keycloak realm for tenant
      await keycloakService.createRealm(slug, name);

      // Step 3: Provision Keycloak clients (plexica-web, plexica-api)
      await keycloakService.provisionRealmClients(slug);

      // Step 4: Provision Keycloak roles (tenant_admin, user)
      await keycloakService.provisionRealmRoles(slug);

      // Step 5: Configure refresh token rotation for security
      await keycloakService.configureRefreshTokenRotation(slug);

      // Step 6: Initialize default roles and permissions
      const schemaName = this.getSchemaName(slug);
      await permissionService.initializeDefaultRoles(schemaName);

      // Step 7: Create MinIO bucket (to be implemented)
      // await this.createMinIOBucket(slug);

      // Update tenant status to ACTIVE
      const activeTenant = await this.db.tenant.update({
        where: { id: tenant.id },
        data: { status: TenantStatus.ACTIVE },
        select: {
          id: true,
          slug: true,
          name: true,
          status: true,
          settings: true,
          theme: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return activeTenant;
    } catch (error) {
      // Rollback: Attempt to delete Keycloak realm if provisioning failed
      // This prevents orphaned realms from previous failed attempts
      try {
        await keycloakService.deleteRealm(slug);
        logger.info(
          { tenantSlug: slug },
          'Successfully rolled back Keycloak realm after tenant creation failure'
        );
      } catch (rollbackError) {
        // Log rollback failure but don't mask original error
        logger.warn(
          {
            tenantSlug: slug,
            error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
          },
          'Failed to rollback Keycloak realm - manual cleanup required'
        );
      }

      // If provisioning fails, attempt to update tenant status to indicate failure.
      // Per Spec 002 §5 (line 77), §6 (line 128), and Plan §7 (line 719):
      // Status must remain PROVISIONING (not SUSPENDED) to allow retry/recovery.
      // It's possible the tenant record was removed concurrently (tests/cleanup), so
      // guard the update and log if the record no longer exists instead of throwing
      // an additional error that masks the original provisioning failure.
      try {
        await this.db.tenant.update({
          where: { id: tenant.id },
          data: {
            status: TenantStatus.PROVISIONING,
            settings: {
              ...settings,
              provisioningError: error instanceof Error ? error.message : 'Unknown error',
            },
          },
        });
      } catch (updateErr) {
        logger.warn(
          {
            tenantId: tenant?.id,
            error: updateErr instanceof Error ? updateErr.message : String(updateErr),
          },
          'Could not update tenant status after provisioning failure'
        );
      }

      throw new Error(
        `Failed to provision tenant: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Create a dedicated PostgreSQL schema for the tenant
   */
  private async createTenantSchema(slug: string): Promise<void> {
    // Validate slug before using in SQL
    this.validateSlug(slug);

    const schemaName = this.getSchemaName(slug);

    // Create schema
    await this.db.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);

    // Grant privileges to the current database user
    // In production: plexica, in test: plexica_test
    // Quote the identifier to avoid SQL errors if the username contains special chars
    const dbUser = process.env.DATABASE_USER || 'plexica';
    try {
      await this.db.$executeRawUnsafe(
        `GRANT ALL PRIVILEGES ON SCHEMA "${schemaName}" TO "${dbUser}"`
      );
    } catch (err) {
      // Surface helpful debugging information for CI/local debugging
      // Re-throw after logging so provisioning fails loudly instead of producing cryptic downstream errors
      // (e.g. missing privileges causing later CREATE TABLE to silently fail)
      logger.error(
        {
          tenantSlug: slug,
          schemaName,
          dbUser,
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        },
        'Failed to create tenant-specific schema'
      );
      throw err;
    }

    // Create initial tables for tenant (users, roles, etc.)
    // This will be expanded with actual tenant-specific tables
    await this.db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."users" (
        id TEXT PRIMARY KEY,
        keycloak_id TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        first_name TEXT,
        last_name TEXT,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await this.db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."roles" (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        description TEXT,
        permissions JSONB NOT NULL DEFAULT '[]',
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await this.db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."user_roles" (
        user_id TEXT NOT NULL,
        role_id TEXT NOT NULL,
        assigned_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, role_id),
        FOREIGN KEY (user_id) REFERENCES "${schemaName}"."users"(id) ON DELETE CASCADE,
        FOREIGN KEY (role_id) REFERENCES "${schemaName}"."roles"(id) ON DELETE CASCADE
      )
    `);

    // Create workspace tables
    await this.db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."workspaces" (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id TEXT NOT NULL,
        slug TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        settings JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (tenant_id, slug)
      )
    `);

    await this.db.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "workspaces_tenant_id_idx" 
      ON "${schemaName}"."workspaces"(tenant_id)
    `);

    await this.db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."workspace_members" (
        workspace_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL,
        invited_by TEXT NOT NULL,
        joined_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (workspace_id, user_id),
        FOREIGN KEY (workspace_id) REFERENCES "${schemaName}"."workspaces"(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES "${schemaName}"."users"(id) ON DELETE CASCADE,
        FOREIGN KEY (invited_by) REFERENCES "${schemaName}"."users"(id)
      )
    `);

    await this.db.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "workspace_members_user_id_idx" 
      ON "${schemaName}"."workspace_members"(user_id)
    `);

    await this.db.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "workspace_members_workspace_id_idx" 
      ON "${schemaName}"."workspace_members"(workspace_id)
    `);

    await this.db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."teams" (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        owner_id TEXT NOT NULL,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (workspace_id) REFERENCES "${schemaName}"."workspaces"(id) ON DELETE CASCADE,
        FOREIGN KEY (owner_id) REFERENCES "${schemaName}"."users"(id)
      )
    `);

    await this.db.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "teams_workspace_id_idx" 
      ON "${schemaName}"."teams"(workspace_id)
    `);

    await this.db.$executeRawUnsafe(`
       CREATE INDEX IF NOT EXISTS "teams_owner_id_idx" 
       ON "${schemaName}"."teams"(owner_id)
     `);

    // Create team members table with CASCADE DELETE on user removal
    await this.db.$executeRawUnsafe(`
       CREATE TABLE IF NOT EXISTS "${schemaName}"."TeamMember" (
         "teamId" TEXT NOT NULL,
         "user_id" TEXT NOT NULL,
         "role" TEXT NOT NULL DEFAULT 'MEMBER',
         "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
         PRIMARY KEY ("teamId", "user_id"),
         FOREIGN KEY ("teamId") REFERENCES "${schemaName}"."teams"(id) ON DELETE CASCADE,
         FOREIGN KEY ("user_id") REFERENCES "${schemaName}"."users"(id) ON DELETE CASCADE
       )
     `);

    await this.db.$executeRawUnsafe(`
       CREATE INDEX IF NOT EXISTS "team_member_user_id_idx" 
       ON "${schemaName}"."TeamMember"("user_id")
     `);

    await this.db.$executeRawUnsafe(`
       CREATE INDEX IF NOT EXISTS "team_member_team_id_idx" 
       ON "${schemaName}"."TeamMember"("teamId")
     `);

    await this.db.$executeRawUnsafe(`
       CREATE TABLE IF NOT EXISTS "${schemaName}"."workspace_resources" (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id TEXT NOT NULL,
        resource_type TEXT NOT NULL,
        resource_id TEXT NOT NULL,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (workspace_id, resource_type, resource_id),
        FOREIGN KEY (workspace_id) REFERENCES "${schemaName}"."workspaces"(id) ON DELETE CASCADE
      )
    `);

    await this.db.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "workspace_resources_workspace_id_idx" 
      ON "${schemaName}"."workspace_resources"(workspace_id)
    `);

    await this.db.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "workspace_resources_type_id_idx" 
      ON "${schemaName}"."workspace_resources"(resource_type, resource_id)
    `);
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
   * Delete tenant (soft delete by marking as PENDING_DELETION)
   */
  async deleteTenant(id: string): Promise<void> {
    const tenant = await this.db.tenant.findUnique({
      where: { id },
    });

    if (!tenant) {
      throw new Error('Tenant not found');
    }

    // Mark as pending deletion
    await this.db.tenant.update({
      where: { id },
      data: { status: TenantStatus.PENDING_DELETION },
    });

    // In a production system, you would queue a background job to:
    // 1. Delete Keycloak realm
    // 2. Drop PostgreSQL schema
    // 3. Delete MinIO bucket
    // 4. Finally delete the tenant record
  }

  /**
   * Hard delete tenant and all associated resources
   * WARNING: This permanently deletes all tenant data
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

    try {
      // Delete Keycloak realm
      await keycloakService.deleteRealm(tenant.slug);

      // Drop PostgreSQL schema
      const schemaName = this.getSchemaName(tenant.slug);
      await this.db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);

      // Delete tenant record
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
