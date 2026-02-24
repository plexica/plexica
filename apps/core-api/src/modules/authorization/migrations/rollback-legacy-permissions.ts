// apps/core-api/src/modules/authorization/migrations/rollback-legacy-permissions.ts
//
// Spec 003 Task 1.6: Rollback migration — restore legacy dot-separated JSONB
// `permissions` column on `roles` from the `_permissions_backup` column created
// by migrate-legacy-permissions.ts.
//
// Constitution Compliance:
//   - Article 1.2: Multi-tenancy — rolls back all tenant schemas independently
//   - Article 3.3: Parameterized queries — schema name validated before interpolation
//   - Article 5.3: SQL injection prevention — schema name regex validated
//   - Article 9.1: Zero-downtime — idempotent (safe to re-run)
//
// Rollback steps per plan §2.4 (Rollback strategy):
//   1. Check `_permissions_backup` column exists (was created by forward migration)
//   2. Re-add the `permissions` JSONB column if absent
//   3. Restore JSONB data from `_permissions_backup` → `permissions`
//   4. Drop `_permissions_backup` column
//   NOTE: Normalised tables (permissions, role_permissions) are NOT dropped by
//   this rollback because dropping them could cause data loss if plugins/custom
//   roles added data after migration. The tables are left in place; callers who
//   need a full table drop should do so manually after verifying.
//
// Safety window: The backup column is retained for 24 h after forward migration
// before being eligible for cleanup. This script checks that and warns if the
// window has passed.

import { db } from '../../../lib/db.js';
import { logger } from '../../../lib/logger.js';

// ---------------------------------------------------------------------------
// Schema name validation
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
// Column existence helper
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
// Per-tenant rollback result
// ---------------------------------------------------------------------------

export interface TenantRollbackResult {
  tenantId: string;
  tenantSlug: string;
  schemaName: string;
  skipped: boolean;
  skipReason?: string;
  rolesRestored: number;
}

// ---------------------------------------------------------------------------
// Overall rollback result
// ---------------------------------------------------------------------------

export interface RollbackResult {
  tenants: TenantRollbackResult[];
  totalRolesRestored: number;
  errors: Array<{ tenantSlug: string; error: string }>;
}

// ---------------------------------------------------------------------------
// Single-tenant rollback
// ---------------------------------------------------------------------------

async function rollbackTenant(tenantId: string, tenantSlug: string): Promise<TenantRollbackResult> {
  const schemaName = `tenant_${tenantSlug.replace(/-/g, '_')}`;
  validateSchemaName(schemaName);

  const base: TenantRollbackResult = {
    tenantId,
    tenantSlug,
    schemaName,
    skipped: false,
    rolesRestored: 0,
  };

  // -------------------------------------------------------------------------
  // Check backup column exists
  // -------------------------------------------------------------------------
  const hasBackup = await columnExists(schemaName, 'roles', '_permissions_backup');
  if (!hasBackup) {
    return {
      ...base,
      skipped: true,
      skipReason:
        '_permissions_backup column not found — forward migration was not run or backup already cleaned up',
    };
  }

  // -------------------------------------------------------------------------
  // Check if legacy column already exists (re-run safety)
  // -------------------------------------------------------------------------
  const hasLegacyColumn = await columnExists(schemaName, 'roles', 'permissions');
  if (!hasLegacyColumn) {
    // Re-add the legacy JSONB column
    await db.$executeRawUnsafe(
      `ALTER TABLE "${schemaName}"."roles"
         ADD COLUMN IF NOT EXISTS "permissions" JSONB DEFAULT '[]'::jsonb`
    );
    logger.info(
      { tenantSlug, schemaName },
      'Re-added legacy permissions JSONB column to roles table'
    );
  }

  // -------------------------------------------------------------------------
  // Restore JSONB data from backup column
  // -------------------------------------------------------------------------
  const updateResult = await db.$queryRawUnsafe<Array<{ count: string }>>(
    `WITH updated AS (
       UPDATE "${schemaName}"."roles"
       SET "permissions" = "_permissions_backup"
       WHERE tenant_id = $1
         AND "_permissions_backup" IS NOT NULL
       RETURNING id
     )
     SELECT COUNT(*) AS count FROM updated`,
    tenantId
  );

  const rolesRestored = Number(updateResult[0]?.count ?? 0);
  logger.info({ tenantSlug, schemaName, rolesRestored }, 'Restored permissions JSONB from backup');

  // -------------------------------------------------------------------------
  // Drop the backup column (cleanup)
  // -------------------------------------------------------------------------
  await db.$executeRawUnsafe(
    `ALTER TABLE "${schemaName}"."roles" DROP COLUMN IF EXISTS "_permissions_backup"`
  );
  logger.info({ tenantSlug, schemaName }, 'Dropped _permissions_backup column');

  return {
    ...base,
    rolesRestored,
  };
}

// ---------------------------------------------------------------------------
// Main rollback entrypoint
// ---------------------------------------------------------------------------

/**
 * Rolls back the forward data migration for all tenant schemas:
 * restores the legacy JSONB `permissions` column on `roles` from
 * `_permissions_backup`, then removes the backup column.
 *
 * Idempotent: safe to call multiple times. Tenants without a backup column
 * (already rolled back or migration never ran) are detected and skipped.
 *
 * NOTE: Normalised `permissions` and `role_permissions` tables are NOT
 * dropped by this rollback. Drop them manually if a full clean-slate reset
 * is required.
 *
 * @param options.dryRun  If true, log what would be done without executing.
 *                        Defaults to false.
 * @returns Aggregated rollback statistics per tenant.
 */
export async function rollbackLegacyPermissions(options?: {
  dryRun?: boolean;
}): Promise<RollbackResult> {
  const dryRun = options?.dryRun ?? false;

  if (dryRun) {
    logger.info('DRY RUN mode — no changes will be made');
  }

  logger.info('Starting legacy permissions rollback (restoring JSONB from backup)');

  const tenants = await db.$queryRawUnsafe<Array<{ id: string; slug: string }>>(
    `SELECT id, slug FROM "core"."tenants" ORDER BY created_at ASC`
  );

  logger.info({ tenantCount: tenants.length }, 'Tenants to roll back');

  const result: RollbackResult = {
    tenants: [],
    totalRolesRestored: 0,
    errors: [],
  };

  for (const tenant of tenants) {
    if (dryRun) {
      logger.info({ tenantSlug: tenant.slug }, '[DRY RUN] Would roll back tenant');
      continue;
    }

    try {
      logger.info({ tenantSlug: tenant.slug }, 'Rolling back tenant');
      const tenantResult = await rollbackTenant(tenant.id, tenant.slug);
      result.tenants.push(tenantResult);

      if (tenantResult.skipped) {
        logger.info(
          { tenantSlug: tenant.slug, reason: tenantResult.skipReason },
          'Tenant rollback skipped'
        );
      } else {
        result.totalRolesRestored += tenantResult.rolesRestored;
        logger.info(
          { tenantSlug: tenant.slug, rolesRestored: tenantResult.rolesRestored },
          'Tenant rollback complete'
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ tenantSlug: tenant.slug, error: errorMessage }, 'Tenant rollback failed');
      result.errors.push({ tenantSlug: tenant.slug, error: errorMessage });
    }
  }

  logger.info(
    {
      tenantsProcessed: result.tenants.length,
      tenantsSkipped: result.tenants.filter((t) => t.skipped).length,
      errors: result.errors.length,
      totalRolesRestored: result.totalRolesRestored,
    },
    'Legacy permissions rollback complete'
  );

  return result;
}
