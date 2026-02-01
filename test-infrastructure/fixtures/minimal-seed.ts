/**
 * Minimal Seed Data for Plexica Tests
 *
 * This script creates a minimal set of data for running tests:
 * - 2 tenants (acme-corp, demo-company)
 * - 2 users per tenant (admin, member)
 * - 1 workspace per tenant
 * - MinIO buckets for each tenant
 * - No plugins (tests add plugins as needed)
 *
 * Usage: tsx test-infrastructure/fixtures/minimal-seed.ts
 */

import { PrismaClient, TenantStatus } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';
import { resolve } from 'path';
import { Client as MinioClient } from 'minio';

// Load test environment variables
config({ path: resolve(__dirname, '../../apps/core-api/.env.test') });

// Create PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Create Prisma adapter for node-postgres
const adapter = new PrismaPg(pool);

// Create Prisma Client with adapter
const prisma = new PrismaClient({
  adapter,
});

// Create MinIO client
const minioClient = new MinioClient({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT || '9010', 10),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin_test',
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin_test',
});

// Keycloak user IDs (these should match the users in keycloak-test-realm.json)
// In a real scenario, these would be fetched from Keycloak after user creation
const KEYCLOAK_USERS = {
  superAdmin: 'keycloak-super-admin-id',
  acmeAdmin: 'keycloak-acme-admin-id',
  acmeMember: 'keycloak-acme-member-id',
  demoAdmin: 'keycloak-demo-admin-id',
};

async function createTenantSchema(tenantSlug: string) {
  const schemaName = `tenant_${tenantSlug.replace(/-/g, '_')}`;

  console.log(`  Creating schema: ${schemaName}`);

  // Create schema
  await prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);

  // Create tables in tenant schema (replicating the template from core schema)
  await prisma.$executeRawUnsafe(`
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

  await prisma.$executeRawUnsafe(`
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

  await prisma.$executeRawUnsafe(`
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

  await prisma.$executeRawUnsafe(`
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

  await prisma.$executeRawUnsafe(`
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

  console.log(`  ✅ Schema ${schemaName} created`);
}

async function createTenantBucket(tenantSlug: string) {
  const bucketName = `tenant-${tenantSlug}`;

  console.log(`  Creating MinIO bucket: ${bucketName}`);

  const exists = await minioClient.bucketExists(bucketName);
  if (!exists) {
    await minioClient.makeBucket(bucketName, 'us-east-1');

    // Set bucket policy (private by default)
    const policy = {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: { AWS: ['*'] },
          Action: ['s3:GetObject'],
          Resource: [`arn:aws:s3:::${bucketName}/*`],
          Condition: {
            StringEquals: {
              's3:ExistingObjectTag/public': 'true',
            },
          },
        },
      ],
    };

    await minioClient.setBucketPolicy(bucketName, JSON.stringify(policy));
    console.log(`  ✅ Bucket ${bucketName} created`);
  } else {
    console.log(`  ℹ️  Bucket ${bucketName} already exists`);
  }
}

async function seedMinimalData() {
  console.log('🌱 Starting minimal seed for tests...\n');

  try {
    // 1. Create tenants in core schema
    console.log('📦 Creating tenants...');

    const tenant1 = await prisma.tenant.upsert({
      where: { slug: 'acme-corp' },
      update: {},
      create: {
        id: 'tenant-acme-corp',
        slug: 'acme-corp',
        name: 'Acme Corporation',
        status: TenantStatus.ACTIVE,
        settings: {
          timezone: 'America/New_York',
          locale: 'en-US',
          features: { workspaces: true, plugins: true },
        },
        theme: {
          primaryColor: '#3B82F6',
          secondaryColor: '#8B5CF6',
        },
      },
    });
    console.log(`  ✅ Created tenant: ${tenant1.name} (${tenant1.slug})`);

    const tenant2 = await prisma.tenant.upsert({
      where: { slug: 'demo-company' },
      update: {},
      create: {
        id: 'tenant-demo-company',
        slug: 'demo-company',
        name: 'Demo Company',
        status: TenantStatus.ACTIVE,
        settings: {
          timezone: 'America/Los_Angeles',
          locale: 'en-US',
          features: { workspaces: true, plugins: true },
        },
        theme: {
          primaryColor: '#F59E0B',
          secondaryColor: '#D97706',
        },
      },
    });
    console.log(`  ✅ Created tenant: ${tenant2.name} (${tenant2.slug})`);

    // 2. Create tenant schemas
    console.log('\n🏗️  Creating tenant schemas...');
    await createTenantSchema('acme-corp');
    await createTenantSchema('demo-company');

    // 3. Create MinIO buckets for tenants
    console.log('\n🪣 Creating MinIO buckets...');
    await createTenantBucket('acme-corp');
    await createTenantBucket('demo-company');

    // 4. Create users in tenant schemas
    console.log('\n👥 Creating users...');

    // Acme Corp users
    await prisma.$executeRawUnsafe(`
      INSERT INTO "tenant_acme_corp"."users" (id, keycloak_id, email, first_name, last_name, locale)
      VALUES 
        ('user-acme-admin', '${KEYCLOAK_USERS.acmeAdmin}', 'admin@acme.test', 'Admin', 'Acme', 'en'),
        ('user-acme-member', '${KEYCLOAK_USERS.acmeMember}', 'member@acme.test', 'Member', 'Acme', 'en')
      ON CONFLICT (keycloak_id) DO NOTHING
    `);
    console.log('  ✅ Created users for acme-corp');

    // Demo Company users
    await prisma.$executeRawUnsafe(`
      INSERT INTO "tenant_demo_company"."users" (id, keycloak_id, email, first_name, last_name, locale)
      VALUES 
        ('user-demo-admin', '${KEYCLOAK_USERS.demoAdmin}', 'admin@demo.test', 'Admin', 'Demo', 'en')
      ON CONFLICT (keycloak_id) DO NOTHING
    `);
    console.log('  ✅ Created users for demo-company');

    // 5. Create workspaces
    console.log('\n🏢 Creating workspaces...');

    // Acme Corp workspace
    await prisma.$executeRawUnsafe(`
      INSERT INTO "tenant_acme_corp"."workspaces" (id, tenant_id, slug, name, description, settings)
      VALUES 
        ('workspace-acme-default', 'tenant-acme-corp', 'default', 'Default Workspace', 'Main workspace for Acme Corp', '{"visibility": "private"}')
      ON CONFLICT (tenant_id, slug) DO NOTHING
    `);

    // Add workspace members
    await prisma.$executeRawUnsafe(`
      INSERT INTO "tenant_acme_corp"."workspace_members" (workspace_id, user_id, role, invited_by)
      VALUES 
        ('workspace-acme-default', 'user-acme-admin', 'ADMIN', 'user-acme-admin'),
        ('workspace-acme-default', 'user-acme-member', 'MEMBER', 'user-acme-admin')
      ON CONFLICT (workspace_id, user_id) DO NOTHING
    `);
    console.log('  ✅ Created workspace for acme-corp');

    // Demo Company workspace
    await prisma.$executeRawUnsafe(`
      INSERT INTO "tenant_demo_company"."workspaces" (id, tenant_id, slug, name, description, settings)
      VALUES 
        ('workspace-demo-default', 'tenant-demo-company', 'default', 'Default Workspace', 'Main workspace for Demo Company', '{"visibility": "private"}')
      ON CONFLICT (tenant_id, slug) DO NOTHING
    `);

    await prisma.$executeRawUnsafe(`
      INSERT INTO "tenant_demo_company"."workspace_members" (workspace_id, user_id, role, invited_by)
      VALUES 
        ('workspace-demo-default', 'user-demo-admin', 'ADMIN', 'user-demo-admin')
      ON CONFLICT (workspace_id, user_id) DO NOTHING
    `);
    console.log('  ✅ Created workspace for demo-company');

    // 6. Create super admin
    console.log('\n🔐 Creating super admin...');
    await prisma.superAdmin.upsert({
      where: { email: 'super-admin@test.plexica.local' },
      update: {},
      create: {
        id: 'super-admin-1',
        keycloakId: KEYCLOAK_USERS.superAdmin,
        email: 'super-admin@test.plexica.local',
        name: 'Test Super Admin',
      },
    });
    console.log('  ✅ Created super admin');

    console.log('\n✅ Minimal seed completed successfully!\n');
    console.log('📊 Summary:');
    console.log('  - 2 tenants created');
    console.log('  - 2 tenant schemas created');
    console.log('  - 2 MinIO buckets created');
    console.log('  - 3 users created (2 in acme-corp, 1 in demo-company)');
    console.log('  - 2 workspaces created');
    console.log('  - 1 super admin created');
    console.log();
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

// Run the seed
seedMinimalData()
  .then(() => {
    console.log('Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
