// File: apps/core-api/src/services/provisioning-steps/schema-step.ts
// Spec 001 T001-03: PostgreSQL schema creation provisioning step

import { PrismaClient } from '@plexica/database';
import { logger } from '../../lib/logger.js';
import { permissionService } from '../permission.service.js';
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

    // Base tables
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

    // Initialize default roles and permissions
    await permissionService.initializeDefaultRoles(schemaName);

    logger.info({ tenantSlug: this.slug, schemaName }, 'Tenant schema created successfully');
  }

  async rollback(): Promise<void> {
    const schemaName = this.getSchemaName();
    logger.info({ tenantSlug: this.slug, schemaName }, 'Rolling back tenant schema');
    await this.db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  }
}
