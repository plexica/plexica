// apps/core-api/src/services/tenant-migration.service.ts
//
// Runs plugin SQL migration files against every active tenant schema in
// isolated per-tenant transactions. A failure in one tenant does not roll
// back migrations for other tenants (Spec 004 FR-005, Edge Case 2).
//
// Constitution Compliance:
//   - Article 1.2: Tenant isolation — each tenant's DDL runs in its own schema
//   - Article 3.3: Parameterised queries — schema names validated by regex before
//     interpolation; all SQL executed via $executeRawUnsafe only after DDL-only check
//   - Article 5.3: Input validation — DDL-only guard rejects any DML in plugin SQL
//   - Article 6.3: Pino JSON logging with standard fields

import { db } from '../lib/db.js';
import { tenantService } from './tenant.service.js';
import { TENANT_STATUS } from '../constants/index.js';
import { logger } from '../lib/logger.js';
import type { Logger } from 'pino';

// ============================================================================
// Types
// ============================================================================

export interface MigrationResult {
  tenantId: string;
  success: boolean;
  migrationsRun: number;
  error?: string;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * SQL keywords and patterns that must never appear in plugin migration SQL.
 * Plugin migrations are DDL-only (CREATE TABLE, ALTER TABLE, CREATE INDEX, CREATE TYPE).
 *
 * Blocked categories:
 *   DML        — INSERT, UPDATE, DELETE, SELECT (data manipulation / exfiltration)
 *   DDL drops  — DROP, TRUNCATE (destructive schema changes)
 *   Privilege  — GRANT, REVOKE (privilege escalation)
 *   Exec paths — COPY, EXECUTE, EXEC, DO, CALL (arbitrary code / file I/O)
 *   Session    — SET (session hijacking / search_path override)
 *   Stored code — CREATE FUNCTION, CREATE PROCEDURE, CREATE TRIGGER
 *                 (code injection via stored routines)
 *
 * Rejecting these prevents cross-tenant data leaks, privilege escalation, and
 * arbitrary code execution even if a malicious plugin attempts to abuse migration
 * SQL (Spec 004 §10, Constitution Article 5.3).
 */
const FORBIDDEN_SQL_KEYWORDS = [
  // DML
  'INSERT',
  'UPDATE',
  'DELETE',
  'SELECT',
  // Destructive DDL
  'DROP',
  'TRUNCATE',
  // Privilege management
  'GRANT',
  'REVOKE',
  // Execution / file I/O paths
  'COPY',
  'EXECUTE',
  'EXEC',
  'DO',
  'CALL',
  // Session manipulation
  'SET',
  // Stored code — multi-word patterns handled separately below
  'CREATE FUNCTION',
  'CREATE PROCEDURE',
  'CREATE TRIGGER',
] as const;

/**
 * Regex that matches valid schema names produced by tenantService.getSchemaName().
 * Must match the pattern enforced by PermissionRegistrationService.validateSchemaName().
 */
const SCHEMA_NAME_PATTERN = /^tenant_[a-z0-9_]{1,63}$/;

// ============================================================================
// Service
// ============================================================================

/**
 * TenantMigrationService
 *
 * Applies plugin-contributed DDL migrations to every active tenant schema.
 * Each tenant runs in an isolated Prisma transaction; a failure for one
 * tenant is logged and returned as a failed `MigrationResult` without
 * affecting other tenants.
 *
 * Migration tracking: a `_plugin_migrations` table is created in the tenant
 * schema on first run. Migrations already recorded there are skipped so
 * re-runs are safe (idempotent).
 */
export class TenantMigrationService {
  private readonly log: Logger;

  constructor(customLogger?: Logger) {
    this.log = customLogger ?? logger;
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Run all pending migrations declared in a plugin's manifest for every
   * active tenant.
   *
   * @param pluginId  The plugin whose migrations should be applied
   * @param migrations  Array of `{ name, sql }` migration objects to apply,
   *                    in order. If omitted, returns an empty result array.
   * @returns Array of per-tenant results
   */
  async runPluginMigrations(
    pluginId: string,
    migrations: Array<{ name: string; sql: string }>
  ): Promise<MigrationResult[]> {
    if (!migrations || migrations.length === 0) {
      return [];
    }

    // Validate all SQL before touching any tenant (fail-fast)
    for (const migration of migrations) {
      this.assertDdlOnly(migration.name, migration.sql);
    }

    // Load all active tenants
    const tenants = await db.tenant.findMany({
      where: { status: TENANT_STATUS.ACTIVE },
      select: { id: true, slug: true },
    });

    const results: MigrationResult[] = [];

    for (const tenant of tenants) {
      const result = await this.runMigrationsForTenant(tenant, pluginId, migrations);
      results.push(result);
    }

    return results;
  }

  /**
   * Rollback (remove) all plugin-contributed DDL from a single tenant schema.
   *
   * This is a best-effort operation; individual failures are logged but do not
   * throw. The DDL to reverse must be provided by the caller (plan.md §4.4).
   *
   * @param pluginId   The plugin whose migrations to roll back
   * @param tenantId   The specific tenant to roll back
   * @param rollbacks  Array of `{ name, sql }` rollback SQL objects
   */
  async rollbackPluginMigrations(
    pluginId: string,
    tenantId: string,
    rollbacks: Array<{ name: string; sql: string }>
  ): Promise<MigrationResult> {
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, slug: true },
    });

    if (!tenant) {
      return { tenantId, success: false, migrationsRun: 0, error: 'Tenant not found' };
    }

    const schemaName = tenantService.getSchemaName(tenant.slug);
    validateSchemaName(schemaName);

    let migrationsRun = 0;

    try {
      await db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET search_path TO "${schemaName}"`);

        for (const rollback of rollbacks) {
          this.assertDdlOnly(rollback.name, rollback.sql);

          await tx.$executeRawUnsafe(rollback.sql);

          // Remove from tracking table (best-effort)
          await tx.$executeRawUnsafe(
            `DELETE FROM "_plugin_migrations"
             WHERE plugin_id = $1 AND migration_name = $2`,
            pluginId,
            rollback.name
          );

          migrationsRun++;
        }
      });

      this.log.info({ tenantId, pluginId, migrationsRun }, 'Plugin migrations rolled back');
      return { tenantId, success: true, migrationsRun };
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log.error({ tenantId, pluginId, error: errorMsg }, 'Plugin migration rollback failed');
      return { tenantId, success: false, migrationsRun, error: errorMsg };
    }
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  private async runMigrationsForTenant(
    tenant: { id: string; slug: string },
    pluginId: string,
    migrations: Array<{ name: string; sql: string }>
  ): Promise<MigrationResult> {
    const { id: tenantId, slug } = tenant;
    const schemaName = tenantService.getSchemaName(slug);

    try {
      validateSchemaName(schemaName);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log.error({ tenantId, schemaName, error: msg }, 'Invalid schema name — skipping tenant');
      return { tenantId, success: false, migrationsRun: 0, error: msg };
    }

    let migrationsRun = 0;

    try {
      await db.$transaction(async (tx) => {
        // Set the search path for this transaction
        await tx.$executeRawUnsafe(`SET search_path TO "${schemaName}"`);

        // Ensure the migration tracking table exists
        await tx.$executeRawUnsafe(`
          CREATE TABLE IF NOT EXISTS "_plugin_migrations" (
            id             BIGSERIAL PRIMARY KEY,
            plugin_id      TEXT        NOT NULL,
            migration_name TEXT        NOT NULL,
            applied_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (plugin_id, migration_name)
          )
        `);

        for (const migration of migrations) {
          // Skip already-applied migrations (idempotent)
          const existing = await tx.$queryRawUnsafe<Array<{ id: number }>>(
            `SELECT id FROM "_plugin_migrations"
             WHERE plugin_id = $1 AND migration_name = $2
             LIMIT 1`,
            pluginId,
            migration.name
          );

          if (existing.length > 0) {
            this.log.debug(
              { tenantId, pluginId, migration: migration.name },
              'Migration already applied — skipping'
            );
            continue;
          }

          // Execute the DDL (already validated above)
          await tx.$executeRawUnsafe(migration.sql);

          // Record successful application
          await tx.$executeRawUnsafe(
            `INSERT INTO "_plugin_migrations" (plugin_id, migration_name)
             VALUES ($1, $2)`,
            pluginId,
            migration.name
          );

          migrationsRun++;
        }
      });

      this.log.info({ tenantId, pluginId, migrationsRun }, 'Plugin migrations applied to tenant');
      return { tenantId, success: true, migrationsRun };
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log.error(
        { tenantId, pluginId, error: errorMsg },
        'Plugin migration failed for tenant (other tenants unaffected)'
      );
      return { tenantId, success: false, migrationsRun, error: errorMsg };
    }
  }

  /**
   * Assert that the SQL string contains only DDL operations.
   * Throws if any forbidden keyword or pattern is found (case-insensitive).
   *
   * Blocked: DML (INSERT/UPDATE/DELETE/SELECT), destructive DDL (DROP/TRUNCATE),
   * privilege management (GRANT/REVOKE), execution paths (COPY/EXECUTE/EXEC/DO/CALL),
   * session manipulation (SET), and stored-code creation (CREATE FUNCTION/PROCEDURE/TRIGGER).
   *
   * This is a security guard: plugin migration SQL is DDL-only.
   * (Spec 004 §10, Constitution Article 5.3)
   */
  private assertDdlOnly(migrationName: string, sql: string): void {
    const upperSql = sql.toUpperCase();
    for (const keyword of FORBIDDEN_SQL_KEYWORDS) {
      // Multi-word patterns (e.g. "CREATE FUNCTION") use \s+ to tolerate varying whitespace.
      // Single-word patterns use \b word-boundary to avoid false positives
      // (e.g. "CREATE INDEX selected_…" should not trigger SELECT).
      const isMultiWord = keyword.includes(' ');
      const pattern = isMultiWord
        ? new RegExp(keyword.replace(' ', '\\s+'))
        : new RegExp(`\\b${keyword}\\b`);

      if (pattern.test(upperSql)) {
        throw new Error(
          `Migration '${migrationName}' contains forbidden SQL keyword '${keyword}'. ` +
            'Plugin migrations must contain DDL only (CREATE TABLE, ALTER TABLE, ' +
            'CREATE INDEX, CREATE TYPE). DML, privilege management, execution paths, ' +
            'session manipulation, and stored-code creation are not permitted.'
        );
      }
    }
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Validates schema names before interpolation into raw SQL.
 * Mirrors the pattern in PermissionRegistrationService.
 */
function validateSchemaName(schemaName: string): void {
  if (!SCHEMA_NAME_PATTERN.test(schemaName)) {
    throw new Error(
      `Invalid schema name: "${schemaName}". Must match pattern tenant_[a-z0-9_]{1,63}`
    );
  }
}

// Singleton instance
export const tenantMigrationService = new TenantMigrationService();
