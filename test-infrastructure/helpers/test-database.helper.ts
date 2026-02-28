/**
 * Test Database Helper
 *
 * Provides utilities for managing the test database, including:
 * - Connection management
 * - Schema creation/deletion
 * - Data cleanup
 * - Factory methods for creating test data
 */

import { PrismaClient, TenantStatus } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { testMinio } from './test-minio.helper';

export class TestDatabaseHelper {
  private static instance: TestDatabaseHelper;
  private prisma: PrismaClient;
  private pool: Pool;
  private isDisconnected: boolean = false;

  private constructor() {
    // Create PostgreSQL connection pool
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });

    // Create Prisma adapter
    const adapter = new PrismaPg(this.pool);

    // Create Prisma Client with adapter
    this.prisma = new PrismaClient({
      adapter,
      log: process.env.LOG_LEVEL === 'debug' ? ['query', 'error', 'warn'] : ['error'],
    });
  }

  /**
   * Get singleton instance
   */
  static getInstance(): TestDatabaseHelper {
    if (!TestDatabaseHelper.instance) {
      TestDatabaseHelper.instance = new TestDatabaseHelper();
    }
    return TestDatabaseHelper.instance;
  }

  /**
   * Get Prisma client instance
   */
  getPrisma(): PrismaClient {
    return this.prisma;
  }

  /**
   * Get PostgreSQL pool instance
   */
  getPool(): Pool {
    return this.pool;
  }

  /**
   * Truncate all tables in core schema
   */
  async truncateCore(): Promise<void> {
    try {
      // Fetch all table names in the 'core' schema and truncate them individually.
      // Using multiple single-statement calls avoids issues with multi-statement
      // blocks and keeps the queries visible to Prisma's query runner.
      // Use the native pg pool for read queries to avoid Prisma raw query limitations
      const res = await this.pool.query(`SELECT tablename FROM pg_tables WHERE schemaname = $1`, [
        'core',
      ]);
      const tables: Array<{ tablename: string }> = res.rows || [];

      if (!tables || tables.length === 0) return;

      // Temporarily disable triggers/foreign key checks by setting replication role
      await this.prisma.$executeRawUnsafe(`SET session_replication_role = 'replica'`);

      for (const row of tables) {
        const table = row.tablename;
        // Quote the identifier to be safe against reserved words
        await this.prisma.$executeRawUnsafe(
          `TRUNCATE TABLE core."${table.replace(/"/g, '""')}" CASCADE`
        );
      }

      await this.prisma.$executeRawUnsafe(`SET session_replication_role = DEFAULT`);
    } catch (error: any) {
      console.error('❌ truncateCore failed:');
      console.error('  Message:', error.message);
      console.error('  Code:', error.code);
      console.error('  Meta:', error.meta);
      console.error('  DATABASE_URL:', process.env.DATABASE_URL);
      throw error;
    }
  }

  /**
   * Begin a test transaction useful for speeding up test teardown.
   * Note: Not all tests can use transactions (e.g. tests that rely on DB session-level effects
   * across connections). Use only where appropriate and when tests share the same DB connection.
   */
  async beginTestTransaction(): Promise<void> {
    try {
      await this.prisma.$executeRaw`BEGIN`;
      await this.prisma.$executeRaw`SAVEPOINT vitest_before_each`;
    } catch (error: any) {
      console.warn('Could not begin test transaction:', error.message);
    }
  }

  /**
   * Rollback to savepoint created by beginTestTransaction
   */
  async rollbackTestTransaction(): Promise<void> {
    try {
      await this.prisma.$executeRaw`ROLLBACK TO SAVEPOINT vitest_before_each`;
      await this.prisma.$executeRaw`RELEASE SAVEPOINT vitest_before_each`;
    } catch (error: any) {
      console.warn('Could not rollback test transaction:', error.message);
    }
  }

  /**
   * Drop all tenant schemas
   */
  async dropTenantSchemas(): Promise<void> {
    await this.prisma.$executeRawUnsafe(`
      DO $$
      DECLARE
          r RECORD;
      BEGIN
          FOR r IN (SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'tenant_%')
          LOOP
              EXECUTE 'DROP SCHEMA IF EXISTS ' || quote_ident(r.schema_name) || ' CASCADE';
          END LOOP;
      END $$;
    `);
  }

  /**
   * Create a tenant schema with all tables
   */
  async createTenantSchema(tenantSlug: string): Promise<string> {
    const schemaName = `tenant_${tenantSlug.replace(/-/g, '_')}`;

    // Create schema
    await this.prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);

    // Create users table
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."users" (
        "id" TEXT PRIMARY KEY,
        "keycloak_id" TEXT UNIQUE NOT NULL,
        "email" TEXT UNIQUE NOT NULL,
        "first_name" TEXT,
        "last_name" TEXT,
        "avatar" TEXT,
        "locale" TEXT NOT NULL DEFAULT 'en',
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create workspaces table (includes Spec-011 hierarchy columns: parent_id, depth, path)
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."workspaces" (
        "id" TEXT PRIMARY KEY,
        "tenant_id" TEXT NOT NULL,
        "slug" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "description" TEXT,
        "settings" JSONB NOT NULL DEFAULT '{}',
        "parent_id" TEXT DEFAULT NULL,
        "depth" INTEGER NOT NULL DEFAULT 0,
        "path" VARCHAR NOT NULL DEFAULT '',
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("parent_id") REFERENCES "${schemaName}"."workspaces"("id") ON DELETE RESTRICT
      )
    `);

    // Hierarchy indexes (sargable path LIKE queries per ADR-013)
    await this.prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "idx_ws_${schemaName}_tenant"
        ON "${schemaName}"."workspaces" ("tenant_id")
    `);
    await this.prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "idx_ws_${schemaName}_parent"
        ON "${schemaName}"."workspaces" ("parent_id")
    `);
    await this.prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "idx_ws_${schemaName}_path"
        ON "${schemaName}"."workspaces" USING btree ("path" varchar_pattern_ops)
    `);
    // Root-workspace unique slug: unique (tenant_id, slug) WHERE parent_id IS NULL
    await this.prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_ws_${schemaName}_root_slug"
        ON "${schemaName}"."workspaces" ("tenant_id", "slug")
        WHERE "parent_id" IS NULL
    `);
    // Sibling-scoped unique slug: unique (parent_id, slug) for child workspaces
    await this.prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_ws_${schemaName}_sibling_slug"
        ON "${schemaName}"."workspaces" ("parent_id", "slug")
        WHERE "parent_id" IS NOT NULL
    `);

    // Create workspace_members table
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."workspace_members" (
        "workspace_id" TEXT NOT NULL,
        "user_id" TEXT NOT NULL,
        "role" TEXT NOT NULL,
        "invited_by" TEXT NOT NULL,
        "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY ("workspace_id", "user_id"),
        FOREIGN KEY ("workspace_id") REFERENCES "${schemaName}"."workspaces"("id") ON DELETE CASCADE,
        FOREIGN KEY ("user_id") REFERENCES "${schemaName}"."users"("id") ON DELETE CASCADE,
        FOREIGN KEY ("invited_by") REFERENCES "${schemaName}"."users"("id")
      )
    `);

    // Create teams table
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."teams" (
        "id" TEXT PRIMARY KEY,
        "workspace_id" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "description" TEXT,
        "owner_id" TEXT NOT NULL,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("workspace_id") REFERENCES "${schemaName}"."workspaces"("id") ON DELETE CASCADE,
        FOREIGN KEY ("owner_id") REFERENCES "${schemaName}"."users"("id")
      )
    `);

    // Create TeamMember table (for team membership)
    await this.prisma.$executeRawUnsafe(`
       CREATE TABLE IF NOT EXISTS "${schemaName}"."TeamMember" (
         "teamId" TEXT NOT NULL,
         "user_id" TEXT NOT NULL,
         "role" TEXT NOT NULL DEFAULT 'MEMBER',
         "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
         PRIMARY KEY ("teamId", "user_id"),
         FOREIGN KEY ("teamId") REFERENCES "${schemaName}"."teams"("id") ON DELETE CASCADE,
         FOREIGN KEY ("user_id") REFERENCES "${schemaName}"."users"("id") ON DELETE CASCADE
       )
     `);

    // Create workspace_resources table
    await this.prisma.$executeRawUnsafe(`
       CREATE TABLE IF NOT EXISTS "${schemaName}"."workspace_resources" (
         "id" TEXT PRIMARY KEY,
         "workspace_id" TEXT NOT NULL,
         "resource_type" TEXT NOT NULL,
         "resource_id" TEXT NOT NULL,
         "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
         FOREIGN KEY ("workspace_id") REFERENCES "${schemaName}"."workspaces"("id") ON DELETE CASCADE,
         UNIQUE ("workspace_id", "resource_type", "resource_id")
       )
     `);

    // Create roles table — normalized schema (Spec 003 Task 1.4)
    await this.prisma.$executeRawUnsafe(`
       CREATE TABLE IF NOT EXISTS "${schemaName}"."roles" (
         "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
         "tenant_id" TEXT NOT NULL,
         "name" TEXT NOT NULL,
         "description" TEXT,
         "is_system" BOOLEAN NOT NULL DEFAULT false,
         "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
         "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
         CONSTRAINT "uq_roles_tenant_name" UNIQUE ("tenant_id", "name")
       )
     `);
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "idx_roles_tenant_id" ON "${schemaName}"."roles"("tenant_id")`
    );

    // Create permissions table (Spec 003)
    await this.prisma.$executeRawUnsafe(`
       CREATE TABLE IF NOT EXISTS "${schemaName}"."permissions" (
         "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
         "tenant_id" TEXT NOT NULL,
         "key" TEXT NOT NULL,
         "name" TEXT NOT NULL,
         "description" TEXT,
         "plugin_id" TEXT,
         "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
         CONSTRAINT "uq_permissions_tenant_key" UNIQUE ("tenant_id", "key")
       )
     `);
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "idx_permissions_tenant_id" ON "${schemaName}"."permissions"("tenant_id")`
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "idx_permissions_plugin_id" ON "${schemaName}"."permissions"("plugin_id") WHERE "plugin_id" IS NOT NULL`
    );

    // Create role_permissions join table (Spec 003)
    await this.prisma.$executeRawUnsafe(`
       CREATE TABLE IF NOT EXISTS "${schemaName}"."role_permissions" (
         "role_id" TEXT NOT NULL,
         "permission_id" TEXT NOT NULL,
         "tenant_id" TEXT NOT NULL,
         PRIMARY KEY ("role_id", "permission_id"),
         FOREIGN KEY ("role_id") REFERENCES "${schemaName}"."roles"("id") ON DELETE CASCADE,
         FOREIGN KEY ("permission_id") REFERENCES "${schemaName}"."permissions"("id") ON DELETE CASCADE
       )
     `);
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "idx_role_permissions_permission_id" ON "${schemaName}"."role_permissions"("permission_id")`
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "idx_role_permissions_tenant_id" ON "${schemaName}"."role_permissions"("tenant_id")`
    );

    // Create user_roles table (Spec 003)
    await this.prisma.$executeRawUnsafe(`
       CREATE TABLE IF NOT EXISTS "${schemaName}"."user_roles" (
         "user_id" TEXT NOT NULL,
         "role_id" TEXT NOT NULL,
         "tenant_id" TEXT NOT NULL,
         "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
         PRIMARY KEY ("user_id", "role_id"),
         FOREIGN KEY ("role_id") REFERENCES "${schemaName}"."roles"("id") ON DELETE CASCADE
       )
     `);
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "idx_user_roles_user_id" ON "${schemaName}"."user_roles"("user_id")`
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "idx_user_roles_tenant_id" ON "${schemaName}"."user_roles"("tenant_id")`
    );

    // Create policies table (ABAC deny-only overlay — Spec 003 Task 4.1)
    await this.prisma.$executeRawUnsafe(`
       CREATE TABLE IF NOT EXISTS "${schemaName}"."policies" (
         "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
         "tenant_id" TEXT NOT NULL,
         "name" TEXT NOT NULL,
         "resource" TEXT NOT NULL,
         "effect" TEXT NOT NULL CHECK ("effect" IN ('DENY', 'FILTER')),
         "conditions" JSONB NOT NULL DEFAULT '{}',
         "priority" INTEGER NOT NULL DEFAULT 0,
         "source" TEXT NOT NULL CHECK ("source" IN ('core', 'plugin', 'super_admin', 'tenant_admin')),
         "plugin_id" TEXT,
         "is_active" BOOLEAN NOT NULL DEFAULT true,
         "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
         "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
         CONSTRAINT "uq_policies_tenant_name" UNIQUE ("tenant_id", "name"),
         CONSTRAINT "chk_policies_conditions_object" CHECK (jsonb_typeof("conditions") = 'object'),
         CONSTRAINT "chk_policies_conditions_size" CHECK (octet_length("conditions"::text) <= 65536)
       )
     `);
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "idx_policies_tenant_id" ON "${schemaName}"."policies"("tenant_id")`
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "idx_policies_resource" ON "${schemaName}"."policies"("tenant_id", "resource")`
    );
    await this.prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "idx_policies_source" ON "${schemaName}"."policies"("tenant_id", "source")`
    );

    return schemaName;
  }

  /**
   * Factory: Create a test tenant
   */
  async createTenant(data: {
    slug: string;
    name: string;
    status?: TenantStatus;
    withSchema?: boolean;
    withMinioBucket?: boolean;
  }) {
    const tenant = await this.prisma.tenant.create({
      data: {
        slug: data.slug,
        name: data.name,
        status: data.status || TenantStatus.ACTIVE,
        settings: {
          timezone: 'UTC',
          locale: 'en-US',
          features: { workspaces: true, plugins: true },
        },
        theme: {
          primaryColor: '#3B82F6',
          secondaryColor: '#8B5CF6',
        },
      },
    });

    if (data.withSchema !== false) {
      await this.createTenantSchema(data.slug);
    }

    if (data.withMinioBucket !== false) {
      await testMinio.createTenantBucket(data.slug);
    }

    return tenant;
  }

  /**
   * Factory: Create a test user in a tenant schema
   */
  async createUser(
    tenantSlug: string,
    data: {
      id?: string;
      keycloakId: string;
      email: string;
      firstName?: string;
      lastName?: string;
    }
  ) {
    const schemaName = `tenant_${tenantSlug.replace(/-/g, '_')}`;
    const userId = data.id || `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    await this.prisma.$executeRawUnsafe(
      `
      INSERT INTO "${schemaName}"."users" (id, keycloak_id, email, first_name, last_name)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (keycloak_id) DO UPDATE SET
        email = EXCLUDED.email,
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name
      RETURNING *
    `,
      userId,
      data.keycloakId,
      data.email,
      data.firstName || null,
      data.lastName || null
    );

    return { id: userId, ...data };
  }

  /**
   * Factory: Create a test workspace in a tenant schema
   */
  async createWorkspace(
    tenantSlug: string,
    tenantId: string,
    data: {
      slug: string;
      name: string;
      description?: string;
      ownerId: string;
    }
  ) {
    const schemaName = `tenant_${tenantSlug.replace(/-/g, '_')}`;
    const workspaceId = `workspace-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Create workspace
    await this.prisma.$executeRawUnsafe(
      `
      INSERT INTO "${schemaName}"."workspaces" (id, tenant_id, slug, name, description, settings)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (tenant_id, slug) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description
    `,
      workspaceId,
      tenantId,
      data.slug,
      data.name,
      data.description || null,
      JSON.stringify({ visibility: 'private' })
    );

    // Add owner as admin
    await this.prisma.$executeRawUnsafe(
      `
      INSERT INTO "${schemaName}"."workspace_members" (workspace_id, user_id, role, invited_by)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (workspace_id, user_id) DO NOTHING
    `,
      workspaceId,
      data.ownerId,
      'ADMIN',
      data.ownerId
    );

    return { id: workspaceId, ...data, tenantId };
  }

  /**
   * Clean up and disconnect
   */
  async disconnect(): Promise<void> {
    if (this.isDisconnected) {
      return; // Already disconnected, skip
    }

    try {
      await this.prisma.$disconnect();
      await this.pool.end();
      this.isDisconnected = true;
    } catch (error: any) {
      // Ignore errors if already disconnected
      if (!error.message?.includes('end on pool more than once')) {
        throw error;
      }
    }
  }

  /**
   * Reset the entire test database
   * This truncates the core schema and drops/recreates tenant schemas
   */
  async reset(): Promise<void> {
    // Prefer lightweight reset where possible: truncate core only
    // and avoid dropping tenant schemas every run which is expensive.
    // Full schema cleanup may still be required occasionally; expose an
    // explicit method `fullReset()` for that.
    await this.truncateCore();
  }

  /**
   * Full reset: truncate core and drop tenant schemas (expensive)
   * Use in CI job setup/teardown when a truly clean DB is required.
   */
  async fullReset(): Promise<void> {
    await this.truncateCore();
    await this.dropTenantSchemas();

    // Recreate tenant schemas for test tenants that will be seeded
    // These slugs match the minimal-seed.ts tenants
    const testTenantSlugs = ['acme', 'demo'];

    for (const slug of testTenantSlugs) {
      try {
        await this.createTenantSchema(slug);
      } catch (error: any) {
        // Log but don't fail - schemas might not exist yet or creation might race with seeding
        console.warn(`⚠️  Could not create tenant schema for '${slug}': ${error.message}`);
      }
    }
  }
}

// Export singleton instance
export const testDb = TestDatabaseHelper.getInstance();

/**
 * Generate a unique tenant slug for test isolation.
 * Uses timestamp + random suffix to ensure uniqueness across parallel test runs.
 *
 * @param prefix - Optional prefix for the slug (default: 'test')
 * @returns A unique slug like 'test-1707317234567-a3b4c5'
 */
export function generateUniqueTenantSlug(prefix: string = 'test'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}
