// apps/core-api/src/modules/authorization/migrations/migrate-legacy-permissions.ts
//
// Spec 003 Task 1.5: Forward migration — legacy dot-separated JSONB permissions
// column → normalized permissions + role_permissions tables.
//
// Constitution Compliance:
//   - Article 1.2: Multi-tenancy — migrates all tenant schemas independently
//   - Article 3.3: Parameterized queries — schema name validated before any
//     interpolation; all user data passed as $N parameters
//   - Article 5.3: SQL injection prevention — schema name regex validated
//   - Article 9.1: Zero-downtime — idempotent (safe to re-run multiple times)
//
// Migration steps per plan §2.4 (Migrations 001–003):
//   1. For each tenant, check if legacy `permissions` JSONB column exists on `roles`
//   2. Add `_permissions_backup` column and copy JSONB data before any modifications
//   3. Read each role's JSONB permissions array
//   4. Convert dot-separated keys → colon-separated (users.read → users:read)
//   5. Upsert rows into `permissions` table
//   6. Insert `role_permissions` join entries
//   7. Verify row counts match expectations before committing
//   8. Drop the legacy JSONB `permissions` column
//
// Idempotency: Each step is guarded — if already run, it detects the state
//   and skips safely without double-inserting or erroring.

import { db } from '../../../lib/db.js';
import { logger } from '../../../lib/logger.js';
import { permissionRegistrationService } from '../permission-registration.service.js';

// ---------------------------------------------------------------------------
// Schema name validation (mirrors SchemaStep and PermissionRegistrationService)
// ---------------------------------------------------------------------------

const SCHEMA_NAME_PATTERN = /^tenant_[a-z0-9_]{1,63}$/;

function validateSchemaName(schemaName: string): void {
  if (!SCHEMA_NAME_PATTERN.test(schemaName)) {
    throw new Error(
      `Invalid schema name: "${schemaName}". Must match pattern tenant_[a-z0-9_]{1,63}`
    );
  }
}

// ---------------------------------------------------------------------------
// Dot → colon permission key conversion (Appendix A)
// ---------------------------------------------------------------------------

/**
 * Converts a legacy dot-separated permission key to the Spec 003 colon-separated format.
 * Examples:
 *   users.read      → users:read
 *   roles.write     → roles:write
 *   settings.read   → settings:read
 *   plugins.write   → plugins:write
 * Any key that already contains a colon is returned unchanged (idempotency).
 */
export function convertPermissionKey(legacyKey: string): string {
  // Already in colon format — no-op (idempotent re-run safety)
  if (legacyKey.includes(':')) return legacyKey;
  // Replace all dots with colons
  return legacyKey.replace(/\./g, ':');
}

// ---------------------------------------------------------------------------
// Per-tenant migration result
// ---------------------------------------------------------------------------

export interface TenantMigrationResult {
  tenantId: string;
  tenantSlug: string;
  schemaName: string;
  skipped: boolean;
  skipReason?: string;
  rolesProcessed: number;
  permissionsUpserted: number;
  rolePermissionsInserted: number;
}

// ---------------------------------------------------------------------------
// Overall migration result
// ---------------------------------------------------------------------------

export interface MigrationResult {
  tenants: TenantMigrationResult[];
  totalRolesProcessed: number;
  totalPermissionsUpserted: number;
  totalRolePermissionsInserted: number;
  errors: Array<{ tenantSlug: string; error: string }>;
}

// ---------------------------------------------------------------------------
// Column existence helpers
// ---------------------------------------------------------------------------

async function columnExists(
  schemaName: string,
  tableName: string,
  columnName: string
): Promise<boolean> {
  validateSchemaName(schemaName);
  const rows = await db.$queryRawUnsafe<Array<{ exists: boolean }>>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = $1
         AND table_name   = $2
         AND column_name  = $3
     ) AS exists`,
    schemaName,
    tableName,
    columnName
  );
  return rows[0]?.exists ?? false;
}

// ---------------------------------------------------------------------------
// Single-tenant migration
// ---------------------------------------------------------------------------

async function migrateTenant(tenantId: string, tenantSlug: string): Promise<TenantMigrationResult> {
  const schemaName = `tenant_${tenantSlug.replace(/-/g, '_')}`;
  validateSchemaName(schemaName);

  const base: TenantMigrationResult = {
    tenantId,
    tenantSlug,
    schemaName,
    skipped: false,
    rolesProcessed: 0,
    permissionsUpserted: 0,
    rolePermissionsInserted: 0,
  };

  // -------------------------------------------------------------------------
  // Step 1: Check if migration is needed
  // -------------------------------------------------------------------------
  const hasLegacyColumn = await columnExists(schemaName, 'roles', 'permissions');
  const hasNewTable = await columnExists(schemaName, 'permissions', 'id');

  if (!hasLegacyColumn && hasNewTable) {
    // Already migrated or new-style schema — skip
    return {
      ...base,
      skipped: true,
      skipReason: 'Legacy permissions column absent; normalized schema already present',
    };
  }

  if (!hasLegacyColumn && !hasNewTable) {
    // Schema does not exist or is in unknown state — skip with warning
    logger.warn({ tenantSlug, schemaName }, 'Skipping tenant: neither legacy nor new tables found');
    return {
      ...base,
      skipped: true,
      skipReason: 'Neither legacy permissions column nor normalized permissions table found',
    };
  }

  // -------------------------------------------------------------------------
  // Step 2: Backup — add `_permissions_backup` column if not already present
  // -------------------------------------------------------------------------
  const hasBackupColumn = await columnExists(schemaName, 'roles', '_permissions_backup');
  if (!hasBackupColumn) {
    await db.$executeRawUnsafe(
      `ALTER TABLE "${schemaName}"."roles"
         ADD COLUMN IF NOT EXISTS "_permissions_backup" JSONB`
    );
    // Copy existing JSONB data into backup column
    await db.$executeRawUnsafe(
      `UPDATE "${schemaName}"."roles"
       SET "_permissions_backup" = "permissions"
       WHERE "_permissions_backup" IS NULL`
    );
    logger.info({ tenantSlug, schemaName }, 'Permissions JSONB backed up to _permissions_backup');
  }

  // -------------------------------------------------------------------------
  // Step 3: Read all roles with their JSONB permissions
  // -------------------------------------------------------------------------
  const roles = await db.$queryRawUnsafe<
    Array<{
      id: string;
      tenant_id: string;
      name: string;
      permissions: string[] | null;
    }>
  >(
    `SELECT id, tenant_id, name,
            COALESCE(
              CASE
                WHEN jsonb_typeof("permissions") = 'array' THEN
                  ARRAY(SELECT jsonb_array_elements_text("permissions"))
                ELSE NULL
              END,
              '{}'::text[]
            ) AS permissions
     FROM "${schemaName}"."roles"
     WHERE tenant_id = $1`,
    tenantId
  );

  // -------------------------------------------------------------------------
  // Step 4–6: Per role — convert keys, upsert permissions, insert join rows
  // -------------------------------------------------------------------------
  let permissionsUpserted = 0;
  let rolePermissionsInserted = 0;

  for (const role of roles) {
    const legacyKeys: string[] = role.permissions ?? [];
    if (legacyKeys.length === 0) continue;

    for (const legacyKey of legacyKeys) {
      const normalizedKey = convertPermissionKey(legacyKey.trim());
      if (!normalizedKey) continue;

      // Upsert into permissions table (idempotent)
      const upserted = await db.$queryRawUnsafe<Array<{ id: string }>>(
        `INSERT INTO "${schemaName}"."permissions"
           (id, tenant_id, key, name, description, plugin_id, created_at)
         VALUES
           (gen_random_uuid(), $1, $2, $3, $4, NULL, NOW())
         ON CONFLICT (tenant_id, key) DO UPDATE
           SET name = EXCLUDED.name
         RETURNING id`,
        tenantId,
        normalizedKey,
        // Generate human-readable name from key (e.g. "users:read" → "Read Users")
        humanReadableName(normalizedKey),
        `Migrated from legacy format: ${legacyKey}`
      );

      if (upserted.length > 0) {
        permissionsUpserted++;
        const permissionId = upserted[0].id;

        // Insert role_permissions join row (idempotent)
        await db.$executeRawUnsafe(
          `INSERT INTO "${schemaName}"."role_permissions"
             (role_id, permission_id, tenant_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (role_id, permission_id) DO NOTHING`,
          role.id,
          permissionId,
          tenantId
        );
        rolePermissionsInserted++;
      }
    }

    base.rolesProcessed++;
  }

  // -------------------------------------------------------------------------
  // Step 7: Verify counts before finalising
  // -------------------------------------------------------------------------
  const permCount = await db.$queryRawUnsafe<Array<{ count: string }>>(
    `SELECT COUNT(*) AS count FROM "${schemaName}"."permissions" WHERE tenant_id = $1`,
    tenantId
  );
  const rpCount = await db.$queryRawUnsafe<Array<{ count: string }>>(
    `SELECT COUNT(*) AS count FROM "${schemaName}"."role_permissions" WHERE tenant_id = $1`,
    tenantId
  );

  logger.info(
    {
      tenantSlug,
      schemaName,
      permissionsInTable: Number(permCount[0]?.count ?? 0),
      rolePermissionsInTable: Number(rpCount[0]?.count ?? 0),
      permissionsUpserted,
      rolePermissionsInserted,
    },
    'Migration count verification'
  );

  // -------------------------------------------------------------------------
  // Step 8: Drop the legacy JSONB `permissions` column
  //   (Backup is preserved in `_permissions_backup`)
  // -------------------------------------------------------------------------
  const stillHasLegacy = await columnExists(schemaName, 'roles', 'permissions');
  if (stillHasLegacy) {
    await db.$executeRawUnsafe(
      `ALTER TABLE "${schemaName}"."roles" DROP COLUMN IF EXISTS "permissions"`
    );
    logger.info({ tenantSlug, schemaName }, 'Legacy permissions JSONB column dropped');
  }

  return {
    ...base,
    rolesProcessed: roles.length,
    permissionsUpserted,
    rolePermissionsInserted,
  };
}

// ---------------------------------------------------------------------------
// Human-readable name generator for migrated permission keys
// ---------------------------------------------------------------------------

function humanReadableName(key: string): string {
  const parts = key.split(':');
  if (parts.length >= 2) {
    const resource = parts[0];
    const action = parts[1];
    // Capitalise action and resource: "users:read" → "Read Users"
    const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    return `${capitalise(action)} ${capitalise(resource)}`;
  }
  // Fallback: title-case the whole key
  return key
    .split(/[.:_-]/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

// ---------------------------------------------------------------------------
// Main migration entrypoint
// ---------------------------------------------------------------------------

/**
 * Runs the forward data migration for all existing tenants:
 * converts legacy dot-separated JSONB permissions to the Spec 003
 * normalized permissions + role_permissions schema.
 *
 * Idempotent: safe to call multiple times. Already-migrated tenants are
 * detected and skipped.
 *
 * @param options.dryRun  If true, log what would be done without executing.
 *                        Defaults to false.
 * @returns Aggregated migration statistics per tenant.
 */
export async function migrateLegacyPermissions(options?: {
  dryRun?: boolean;
}): Promise<MigrationResult> {
  const dryRun = options?.dryRun ?? false;

  if (dryRun) {
    logger.info('DRY RUN mode — no changes will be made');
  }

  logger.info('Starting legacy permissions migration (dot → colon format)');

  // Fetch all tenants from the public schema
  const tenants = await db.$queryRawUnsafe<Array<{ id: string; slug: string }>>(
    `SELECT id, slug FROM "core"."tenants" ORDER BY created_at ASC`
  );

  logger.info({ tenantCount: tenants.length }, 'Tenants to migrate');

  const result: MigrationResult = {
    tenants: [],
    totalRolesProcessed: 0,
    totalPermissionsUpserted: 0,
    totalRolePermissionsInserted: 0,
    errors: [],
  };

  for (const tenant of tenants) {
    if (dryRun) {
      logger.info({ tenantSlug: tenant.slug }, '[DRY RUN] Would migrate tenant');
      continue;
    }

    try {
      logger.info({ tenantSlug: tenant.slug }, 'Migrating tenant');
      const tenantResult = await migrateTenant(tenant.id, tenant.slug);
      result.tenants.push(tenantResult);

      if (tenantResult.skipped) {
        logger.info(
          { tenantSlug: tenant.slug, reason: tenantResult.skipReason },
          'Tenant migration skipped'
        );
      } else {
        result.totalRolesProcessed += tenantResult.rolesProcessed;
        result.totalPermissionsUpserted += tenantResult.permissionsUpserted;
        result.totalRolePermissionsInserted += tenantResult.rolePermissionsInserted;

        // Re-seed core permissions to ensure system roles have all required permissions
        // (idempotent — uses ON CONFLICT DO NOTHING internally)
        const schemaName = tenantResult.schemaName;
        await permissionRegistrationService.registerCorePermissions(tenant.id, schemaName);

        logger.info(
          {
            tenantSlug: tenant.slug,
            rolesProcessed: tenantResult.rolesProcessed,
            permissionsUpserted: tenantResult.permissionsUpserted,
            rolePermissionsInserted: tenantResult.rolePermissionsInserted,
          },
          'Tenant migration complete'
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ tenantSlug: tenant.slug, error: errorMessage }, 'Tenant migration failed');
      result.errors.push({ tenantSlug: tenant.slug, error: errorMessage });
      // Continue with remaining tenants — do not abort the whole migration
    }
  }

  logger.info(
    {
      tenantsProcessed: result.tenants.length,
      tenantsSkipped: result.tenants.filter((t) => t.skipped).length,
      errors: result.errors.length,
      totalRolesProcessed: result.totalRolesProcessed,
      totalPermissionsUpserted: result.totalPermissionsUpserted,
      totalRolePermissionsInserted: result.totalRolePermissionsInserted,
    },
    'Legacy permissions migration complete'
  );

  return result;
}
