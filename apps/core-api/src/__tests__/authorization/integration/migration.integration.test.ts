/**
 * Migration Integration Tests — Spec 003 Task 1.7
 *
 * Tests covering:
 *   1. Forward migration converts dot-separated permissions to colon-separated format
 *   2. Row counts in permissions + role_permissions match expectations
 *   3. Idempotency: running migration twice produces same result
 *   4. Rollback restores the original JSONB data and removes backup column
 *
 * These tests create isolated tenant schemas, inject legacy JSONB data, run the
 * migration/rollback functions, then verify state — without touching other tenants.
 *
 * Setup requirements: PostgreSQL must be running (uses test-infrastructure).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { db } from '../../../lib/db.js';
import {
  migrateLegacyPermissions,
  convertPermissionKey,
} from '../../../modules/authorization/migrations/migrate-legacy-permissions.js';
import { rollbackLegacyPermissions } from '../../../modules/authorization/migrations/rollback-legacy-permissions.js';

// ---------------------------------------------------------------------------
// Test schema helpers
// ---------------------------------------------------------------------------

const TEST_SLUG = 'migration-test-tenant';
const TEST_SCHEMA = `tenant_migration_test_tenant`;
const TEST_TENANT_ID = 'test-migration-tenant-id';

/** Create a minimal tenant row and schema for the migration test. */
async function setupLegacySchema(): Promise<void> {
  // Insert tenant row (idempotent)
  await db.$executeRawUnsafe(
    `INSERT INTO "core"."tenants" (id, slug, name, status, settings, theme, created_at, updated_at)
     VALUES ($1, $2, $3, 'ACTIVE', '{}', '{}', NOW(), NOW())
     ON CONFLICT (slug) DO NOTHING`,
    TEST_TENANT_ID,
    TEST_SLUG,
    'Migration Test Tenant'
  );

  // Create schema
  await db.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${TEST_SCHEMA}"`);

  // Create roles table WITH the legacy JSONB permissions column
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "${TEST_SCHEMA}"."roles" (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      is_system BOOLEAN NOT NULL DEFAULT false,
      permissions JSONB DEFAULT '[]'::jsonb,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "uq_roles_tenant_name_migration" UNIQUE (tenant_id, name)
    )
  `);

  // Create normalized permissions table
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "${TEST_SCHEMA}"."permissions" (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id TEXT NOT NULL,
      key TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      plugin_id TEXT,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "uq_permissions_tenant_key_migration" UNIQUE (tenant_id, key)
    )
  `);

  // Create role_permissions join table
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "${TEST_SCHEMA}"."role_permissions" (
      role_id TEXT NOT NULL,
      permission_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      PRIMARY KEY (role_id, permission_id),
      FOREIGN KEY (role_id) REFERENCES "${TEST_SCHEMA}"."roles"(id) ON DELETE CASCADE,
      FOREIGN KEY (permission_id) REFERENCES "${TEST_SCHEMA}"."permissions"(id) ON DELETE CASCADE
    )
  `);
}

/** Insert legacy roles with dot-separated JSONB permissions. */
async function insertLegacyRoles(): Promise<void> {
  // Clear any existing test data
  await db.$executeRawUnsafe(
    `DELETE FROM "${TEST_SCHEMA}"."role_permissions"
     WHERE tenant_id = $1`,
    TEST_TENANT_ID
  );
  await db.$executeRawUnsafe(
    `DELETE FROM "${TEST_SCHEMA}"."permissions" WHERE tenant_id = $1`,
    TEST_TENANT_ID
  );
  await db.$executeRawUnsafe(
    `DELETE FROM "${TEST_SCHEMA}"."roles" WHERE tenant_id = $1`,
    TEST_TENANT_ID
  );

  // Role 1: admin with many permissions (dot format)
  await db.$executeRawUnsafe(
    `INSERT INTO "${TEST_SCHEMA}"."roles"
       (id, tenant_id, name, is_system, permissions)
     VALUES
       ('role-admin-test', $1, 'admin_role', true,
        '["users.read", "users.write", "roles.read", "roles.write", "settings.read"]'::jsonb)`,
    TEST_TENANT_ID
  );

  // Role 2: viewer with read permissions only (dot format)
  await db.$executeRawUnsafe(
    `INSERT INTO "${TEST_SCHEMA}"."roles"
       (id, tenant_id, name, is_system, permissions)
     VALUES
       ('role-viewer-test', $1, 'viewer_role', false,
        '["users.read", "plugins.read"]'::jsonb)`,
    TEST_TENANT_ID
  );

  // Role 3: empty permissions
  await db.$executeRawUnsafe(
    `INSERT INTO "${TEST_SCHEMA}"."roles"
       (id, tenant_id, name, is_system, permissions)
     VALUES
       ('role-empty-test', $1, 'empty_role', false, '[]'::jsonb)`,
    TEST_TENANT_ID
  );
}

/** Tear down the test schema and tenant row. */
async function teardownLegacySchema(): Promise<void> {
  await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${TEST_SCHEMA}" CASCADE`);
  await db.$executeRawUnsafe(`DELETE FROM "core"."tenants" WHERE slug = $1`, TEST_SLUG);
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('Legacy Permissions Migration (Spec 003 Task 1.7)', () => {
  beforeAll(async () => {
    await setupLegacySchema();
  });

  afterAll(async () => {
    await teardownLegacySchema();
  });

  beforeEach(async () => {
    // Ensure backup column does not exist from a previous test run
    const hasBackup = await db.$queryRawUnsafe<Array<{ exists: boolean }>>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = 'roles' AND column_name = '_permissions_backup'
       ) AS exists`,
      TEST_SCHEMA
    );
    if (hasBackup[0]?.exists) {
      await db.$executeRawUnsafe(
        `ALTER TABLE "${TEST_SCHEMA}"."roles" DROP COLUMN IF EXISTS "_permissions_backup"`
      );
    }

    // Restore legacy permissions column if it was dropped by a previous test
    const hasLegacy = await db.$queryRawUnsafe<Array<{ exists: boolean }>>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = 'roles' AND column_name = 'permissions'
       ) AS exists`,
      TEST_SCHEMA
    );
    if (!hasLegacy[0]?.exists) {
      await db.$executeRawUnsafe(
        `ALTER TABLE "${TEST_SCHEMA}"."roles" ADD COLUMN "permissions" JSONB DEFAULT '[]'::jsonb`
      );
    }

    // Reset to legacy state (column now guaranteed to exist)
    await insertLegacyRoles();
  });

  // -------------------------------------------------------------------------
  // Test 1: Forward migration converts dot → colon
  // -------------------------------------------------------------------------
  it('should convert dot-separated permissions to colon-separated format', async () => {
    const result = await migrateLegacyPermissions();

    const migrationTenant = result.tenants.find((t) => t.tenantSlug === TEST_SLUG);
    expect(migrationTenant).toBeDefined();
    expect(migrationTenant?.skipped).toBe(false);

    // Verify permissions in the normalized table are colon-separated
    const perms = await db.$queryRawUnsafe<Array<{ key: string }>>(
      `SELECT key FROM "${TEST_SCHEMA}"."permissions"
       WHERE tenant_id = $1 ORDER BY key ASC`,
      TEST_TENANT_ID
    );

    const keys = perms.map((p) => p.key);
    expect(keys).toContain('users:read');
    expect(keys).toContain('users:write');
    expect(keys).toContain('roles:read');
    expect(keys).toContain('roles:write');
    expect(keys).toContain('settings:read');
    expect(keys).toContain('plugins:read');

    // No dot-format keys should remain
    for (const key of keys) {
      expect(key).not.toMatch(/\./);
    }
  });

  // -------------------------------------------------------------------------
  // Test 2: Row counts match expectations
  // -------------------------------------------------------------------------
  it('should produce correct permission and role_permissions row counts', async () => {
    await migrateLegacyPermissions();

    // 5 unique permission keys across both roles:
    //   users.read, users.write, roles.read, roles.write, settings.read, plugins.read = 6 unique
    const permCount = await db.$queryRawUnsafe<Array<{ count: string }>>(
      `SELECT COUNT(*) AS count FROM "${TEST_SCHEMA}"."permissions" WHERE tenant_id = $1`,
      TEST_TENANT_ID
    );
    expect(Number(permCount[0]?.count)).toBeGreaterThanOrEqual(6);

    // role_permissions: admin has 5 entries, viewer has 2 entries, empty has 0 = 7 total
    const rpCount = await db.$queryRawUnsafe<Array<{ count: string }>>(
      `SELECT COUNT(*) AS count FROM "${TEST_SCHEMA}"."role_permissions" WHERE tenant_id = $1`,
      TEST_TENANT_ID
    );
    expect(Number(rpCount[0]?.count)).toBe(7);

    // The legacy permissions column should have been dropped
    const legacyColExists = await db.$queryRawUnsafe<Array<{ exists: boolean }>>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = 'roles' AND column_name = 'permissions'
       ) AS exists`,
      TEST_SCHEMA
    );
    expect(legacyColExists[0]?.exists).toBe(false);

    // The backup column should still be present (for rollback within 24h)
    const backupColExists = await db.$queryRawUnsafe<Array<{ exists: boolean }>>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = 'roles' AND column_name = '_permissions_backup'
       ) AS exists`,
      TEST_SCHEMA
    );
    expect(backupColExists[0]?.exists).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Test 3: Idempotency — running migration twice yields same result
  // -------------------------------------------------------------------------
  it('should be idempotent — running migration twice produces the same result', async () => {
    // First run
    await migrateLegacyPermissions();

    const permCountFirst = await db.$queryRawUnsafe<Array<{ count: string }>>(
      `SELECT COUNT(*) AS count FROM "${TEST_SCHEMA}"."permissions" WHERE tenant_id = $1`,
      TEST_TENANT_ID
    );
    const rpCountFirst = await db.$queryRawUnsafe<Array<{ count: string }>>(
      `SELECT COUNT(*) AS count FROM "${TEST_SCHEMA}"."role_permissions" WHERE tenant_id = $1`,
      TEST_TENANT_ID
    );

    // Second run — should skip (legacy column already gone)
    const secondResult = await migrateLegacyPermissions();
    const secondTenant = secondResult.tenants.find((t) => t.tenantSlug === TEST_SLUG);
    expect(secondTenant?.skipped).toBe(true);

    // Counts unchanged
    const permCountSecond = await db.$queryRawUnsafe<Array<{ count: string }>>(
      `SELECT COUNT(*) AS count FROM "${TEST_SCHEMA}"."permissions" WHERE tenant_id = $1`,
      TEST_TENANT_ID
    );
    const rpCountSecond = await db.$queryRawUnsafe<Array<{ count: string }>>(
      `SELECT COUNT(*) AS count FROM "${TEST_SCHEMA}"."role_permissions" WHERE tenant_id = $1`,
      TEST_TENANT_ID
    );

    expect(Number(permCountSecond[0]?.count)).toBe(Number(permCountFirst[0]?.count));
    expect(Number(rpCountSecond[0]?.count)).toBe(Number(rpCountFirst[0]?.count));
  });

  // -------------------------------------------------------------------------
  // Test 4: Rollback restores original JSONB data
  // -------------------------------------------------------------------------
  it('should restore original JSONB data and remove backup column on rollback', async () => {
    // Run forward migration first
    await migrateLegacyPermissions();

    // Verify backup exists and legacy column is gone
    const backupExistsBeforeRollback = await db.$queryRawUnsafe<Array<{ exists: boolean }>>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = 'roles' AND column_name = '_permissions_backup'
       ) AS exists`,
      TEST_SCHEMA
    );
    expect(backupExistsBeforeRollback[0]?.exists).toBe(true);

    // Run rollback
    const rollbackResult = await rollbackLegacyPermissions();
    const tenantRollback = rollbackResult.tenants.find((t) => t.tenantSlug === TEST_SLUG);
    expect(tenantRollback).toBeDefined();
    expect(tenantRollback?.skipped).toBe(false);
    expect(tenantRollback?.rolesRestored).toBeGreaterThan(0);

    // Legacy permissions column should be restored
    const legacyColRestored = await db.$queryRawUnsafe<Array<{ exists: boolean }>>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = 'roles' AND column_name = 'permissions'
       ) AS exists`,
      TEST_SCHEMA
    );
    expect(legacyColRestored[0]?.exists).toBe(true);

    // Backup column should be removed
    const backupGone = await db.$queryRawUnsafe<Array<{ exists: boolean }>>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = 'roles' AND column_name = '_permissions_backup'
       ) AS exists`,
      TEST_SCHEMA
    );
    expect(backupGone[0]?.exists).toBe(false);

    // The JSONB data in the restored column matches the original
    const restoredRoles = await db.$queryRawUnsafe<Array<{ name: string; permissions: unknown }>>(
      `SELECT name, permissions FROM "${TEST_SCHEMA}"."roles"
       WHERE tenant_id = $1 AND name = 'admin_role'`,
      TEST_TENANT_ID
    );

    const adminPerms = restoredRoles[0]?.permissions;
    expect(Array.isArray(adminPerms)).toBe(true);
    expect((adminPerms as string[]).length).toBe(5);
    // Original format (dot-separated) should be restored
    expect(adminPerms).toContain('users.read');
    expect(adminPerms).toContain('users.write');
  });
});

// ---------------------------------------------------------------------------
// Unit-level tests for convertPermissionKey (fast, no DB required)
// ---------------------------------------------------------------------------

describe('convertPermissionKey', () => {
  it('should convert dot-separated to colon-separated', () => {
    expect(convertPermissionKey('users.read')).toBe('users:read');
    expect(convertPermissionKey('roles.write')).toBe('roles:write');
    expect(convertPermissionKey('settings.read')).toBe('settings:read');
    expect(convertPermissionKey('plugins.write')).toBe('plugins:write');
  });

  it('should return colon-separated keys unchanged (idempotency)', () => {
    expect(convertPermissionKey('users:read')).toBe('users:read');
    expect(convertPermissionKey('crm:contacts:read')).toBe('crm:contacts:read');
  });

  it('should handle multi-segment dot keys', () => {
    expect(convertPermissionKey('crm.contacts.read')).toBe('crm:contacts:read');
  });
});
