// File: apps/core-api/src/services/provisioning-steps/schema-step.ts
// Spec 001 T001-03: PostgreSQL schema creation provisioning step
// Spec 003 Task 1.4: Normalized authorization tables (roles, permissions,
//   role_permissions, user_roles) replacing legacy JSONB roles.permissions column.

import { PrismaClient } from '@plexica/database';
import { logger } from '../../lib/logger.js';
import { permissionRegistrationService } from '../../modules/authorization/permission-registration.service.js';
import { SYSTEM_ROLES } from '../../modules/authorization/constants.js';
import type { ProvisioningStep } from '../provisioning-orchestrator.js';

export class SchemaStep implements ProvisioningStep {
  readonly name = 'schema_created';

  constructor(
    private readonly db: PrismaClient,
    private readonly slug: string
  ) {}

  private getSchemaName(): string {
    return `tenant_${this.slug.replace(/-/g, '_')}`;
  }

  async execute(): Promise<void> {
    const schemaName = this.getSchemaName();
    // Derive tenantId from slug — the tenant row will already exist in core.tenants
    // (the Prisma client uses DATABASE_URL with ?schema=core, so core is the search path)
    // at this point (provisioned by TenantStep), so we read it.
    const tenantRow = await this.db.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM "core"."tenants" WHERE slug = $1 LIMIT 1`,
      this.slug
    );
    const tenantId = tenantRow[0]?.id;
    if (!tenantId) {
      throw new Error(
        `SchemaStep: tenant record not found for slug "${this.slug}" — TenantStep must run first`
      );
    }

    // Validate DATABASE_USER to prevent SQL injection via env var
    // Only allow alphanumeric + underscore identifiers (PostgreSQL role names)
    const rawDbUser = process.env.DATABASE_USER || 'plexica';
    const DB_USER_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/;
    if (!DB_USER_PATTERN.test(rawDbUser)) {
      throw new Error(
        `DATABASE_USER env var contains invalid characters: "${rawDbUser}". ` +
          'Only alphanumeric characters and underscores are allowed.'
      );
    }
    const dbUser = rawDbUser;

    logger.info({ tenantSlug: this.slug, schemaName }, 'Creating tenant PostgreSQL schema');

    await this.db.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
    await this.db.$executeRawUnsafe(
      `GRANT ALL PRIVILEGES ON SCHEMA "${schemaName}" TO "${dbUser}"`
    );

    // -------------------------------------------------------------------------
    // users
    // -------------------------------------------------------------------------
    await this.db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."users" (
        id TEXT PRIMARY KEY,
        keycloak_id TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        first_name TEXT,
        last_name TEXT,
        display_name TEXT,
        avatar_url TEXT,
        locale TEXT,
        preferences JSONB DEFAULT '{}',
        status TEXT DEFAULT 'ACTIVE',
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // -------------------------------------------------------------------------
    // roles  — normalized, no more JSONB permissions column (Spec 003 Task 1.4)
    // -------------------------------------------------------------------------
    await this.db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."roles" (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        is_system BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "uq_roles_tenant_name" UNIQUE (tenant_id, name)
      )
    `);
    await this.db.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "idx_roles_tenant_id" ON "${schemaName}"."roles"(tenant_id)`
    );

    // -------------------------------------------------------------------------
    // permissions
    // -------------------------------------------------------------------------
    await this.db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."permissions" (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id TEXT NOT NULL,
        key TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        plugin_id TEXT,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "uq_permissions_tenant_key" UNIQUE (tenant_id, key)
      )
    `);
    await this.db.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "idx_permissions_tenant_id" ON "${schemaName}"."permissions"(tenant_id)`
    );
    await this.db.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "idx_permissions_plugin_id" ON "${schemaName}"."permissions"(plugin_id) WHERE plugin_id IS NOT NULL`
    );

    // -------------------------------------------------------------------------
    // role_permissions  (join table)
    // -------------------------------------------------------------------------
    await this.db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."role_permissions" (
        role_id TEXT NOT NULL,
        permission_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        PRIMARY KEY (role_id, permission_id),
        FOREIGN KEY (role_id) REFERENCES "${schemaName}"."roles"(id) ON DELETE CASCADE,
        FOREIGN KEY (permission_id) REFERENCES "${schemaName}"."permissions"(id) ON DELETE CASCADE
      )
    `);
    await this.db.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "idx_role_permissions_permission_id" ON "${schemaName}"."role_permissions"(permission_id)`
    );
    await this.db.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "idx_role_permissions_tenant_id" ON "${schemaName}"."role_permissions"(tenant_id)`
    );

    // -------------------------------------------------------------------------
    // user_roles
    // -------------------------------------------------------------------------
    await this.db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."user_roles" (
        user_id TEXT NOT NULL,
        role_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        assigned_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, role_id),
        FOREIGN KEY (role_id) REFERENCES "${schemaName}"."roles"(id) ON DELETE CASCADE
      )
    `);
    await this.db.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "idx_user_roles_user_id" ON "${schemaName}"."user_roles"(user_id)`
    );
    await this.db.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "idx_user_roles_tenant_id" ON "${schemaName}"."user_roles"(tenant_id)`
    );

    // -------------------------------------------------------------------------
    // policies  (ABAC deny-only overlay — Spec 003 Task 4.1)
    // -------------------------------------------------------------------------
    await this.db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."policies" (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        resource TEXT NOT NULL,
        effect TEXT NOT NULL CHECK (effect IN ('DENY', 'FILTER')),
        conditions JSONB NOT NULL DEFAULT '{}',
        priority INTEGER NOT NULL DEFAULT 0,
        source TEXT NOT NULL CHECK (source IN ('core', 'plugin', 'super_admin', 'tenant_admin')),
        plugin_id TEXT,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "uq_policies_tenant_name" UNIQUE (tenant_id, name),
        CONSTRAINT "chk_policies_conditions_object" CHECK (jsonb_typeof(conditions) = 'object'),
        CONSTRAINT "chk_policies_conditions_size" CHECK (octet_length(conditions::text) <= 65536)
      )
    `);
    await this.db.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "idx_policies_tenant_id" ON "${schemaName}"."policies"(tenant_id)`
    );
    await this.db.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "idx_policies_resource" ON "${schemaName}"."policies"(tenant_id, resource)`
    );
    await this.db.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "idx_policies_source" ON "${schemaName}"."policies"(tenant_id, source)`
    );

    // -------------------------------------------------------------------------
    // workspaces
    // -------------------------------------------------------------------------
    await this.db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."workspaces" (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id TEXT NOT NULL,
        parent_id TEXT DEFAULT NULL,
        depth INTEGER NOT NULL DEFAULT 0,
        path VARCHAR NOT NULL DEFAULT '',
        slug TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        settings JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "fk_workspaces_parent" FOREIGN KEY (parent_id)
          REFERENCES "${schemaName}"."workspaces"(id) ON DELETE RESTRICT,
        CONSTRAINT "chk_workspaces_depth" CHECK (depth >= 0),
        CONSTRAINT "uq_workspaces_parent_slug" UNIQUE (parent_id, slug)
      )
    `);

    await this.db.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "workspaces_tenant_id_idx" ON "${schemaName}"."workspaces"(tenant_id)`
    );
    await this.db.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "idx_workspaces_parent" ON "${schemaName}"."workspaces"(parent_id)`
    );
    await this.db.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "idx_workspaces_path" ON "${schemaName}"."workspaces" USING btree (path varchar_pattern_ops)`
    );
    await this.db.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "idx_workspaces_depth" ON "${schemaName}"."workspaces"(depth)`
    );
    await this.db.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_workspace_root_slug_unique"
      ON "${schemaName}"."workspaces" (tenant_id, slug)
      WHERE parent_id IS NULL
    `);

    // -------------------------------------------------------------------------
    // workspace_members
    // -------------------------------------------------------------------------
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

    // -------------------------------------------------------------------------
    // teams
    // -------------------------------------------------------------------------
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

    // -------------------------------------------------------------------------
    // workspace_resources
    // -------------------------------------------------------------------------
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

    // -------------------------------------------------------------------------
    // Seed system roles (is_system = true)
    // -------------------------------------------------------------------------
    const systemRoleNames = [
      SYSTEM_ROLES.SUPER_ADMIN,
      SYSTEM_ROLES.TENANT_ADMIN,
      SYSTEM_ROLES.TEAM_ADMIN,
      SYSTEM_ROLES.USER,
    ];

    for (const roleName of systemRoleNames) {
      await this.db.$executeRawUnsafe(
        `INSERT INTO "${schemaName}"."roles"
           (id, tenant_id, name, is_system, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, true, NOW(), NOW())
         ON CONFLICT (tenant_id, name) DO NOTHING`,
        tenantId,
        roleName
      );
    }

    // -------------------------------------------------------------------------
    // Seed core permissions and role-permission mappings
    // -------------------------------------------------------------------------
    await permissionRegistrationService.registerCorePermissions(tenantId, schemaName);

    logger.info({ tenantSlug: this.slug, schemaName }, 'Tenant schema created successfully');
  }

  async rollback(): Promise<void> {
    const schemaName = this.getSchemaName();
    logger.info({ tenantSlug: this.slug, schemaName }, 'Rolling back tenant schema');
    await this.db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  }
}
