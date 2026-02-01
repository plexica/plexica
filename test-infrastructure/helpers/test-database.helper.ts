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
      await this.prisma.$executeRawUnsafe(`
        DO $$
        DECLARE
            r RECORD;
        BEGIN
            SET session_replication_role = replica;
            FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'core')
            LOOP
                EXECUTE 'TRUNCATE TABLE core.' || quote_ident(r.tablename) || ' CASCADE';
            END LOOP;
            SET session_replication_role = DEFAULT;
        END $$;
      `);
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

    // Create workspaces table
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."workspaces" (
        "id" TEXT PRIMARY KEY,
        "tenant_id" TEXT NOT NULL,
        "slug" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "description" TEXT,
        "settings" JSONB NOT NULL DEFAULT '{}',
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE ("tenant_id", "slug")
      )
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
   */
  async reset(): Promise<void> {
    await this.truncateCore();
    await this.dropTenantSchemas();
  }
}

// Export singleton instance
export const testDb = TestDatabaseHelper.getInstance();
