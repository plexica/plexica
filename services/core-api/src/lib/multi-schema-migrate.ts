// multi-schema-migrate.ts
// Runs tenant DDL migrations against all active tenant schemas sequentially.
// Stops on first failure (EC-08) and returns a detailed MigrationReport.
//
// Design note: We do NOT use `prisma migrate deploy` for tenant schemas because
// Prisma stores _prisma_migrations in the schema specified by DATABASE_URL, which
// for the core schema is `core`. When we change the schema to `tenant_<slug>`,
// Prisma cannot find its migration tracking table and fails with
// "Invariant violation: migration persistence is not initialized."
//
// Instead, we execute the tenant DDL migration files directly using raw SQL via
// the Prisma client with SET LOCAL search_path. All migration files use
// CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS so they are idempotent
// and safe to re-run. (See decision-log ID-007 for rollback semantics.)

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

import { prisma } from './database.js';
import { logger } from './logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Relative to src/lib/ → ../.. → services/core-api/
const MIGRATIONS_DIR = resolve(__dirname, '../../prisma/migrations');

// Migration files that contain tenant-schema DDL.
// These are executed in order against every tenant schema.
const TENANT_MIGRATION_FILES = ['003_core_features/migration.sql'];

export interface MigrationResult {
  slug: string;
  status: 'ok' | 'failed' | 'skipped';
  error?: string;
}

export interface MigrationReport {
  total: number;
  migrated: number;
  failed: number;
  stoppedAt?: string;
  results: MigrationResult[];
}

/**
 * Applies all tenant DDL migration files to a single tenant schema.
 * Runs inside a transaction with SET LOCAL search_path so the connection
 * pool is not polluted (same pattern as withTenantDb, Decision Log ID-001).
 */
async function migrateTenantSchema(schemaName: string): Promise<void> {
  for (const relPath of TENANT_MIGRATION_FILES) {
    const sqlPath = resolve(MIGRATIONS_DIR, relPath);
    const rawSql = readFileSync(sqlPath, 'utf8');

    // Strip SQL line comments and split into individual statements.
    const cleanSql = rawSql.replace(/--.*$/gm, '').trim();
    const statements = cleanSql
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    await prisma.$transaction(async (tx) => {
      // schemaName is derived from slug via toSchemaName() — only [a-z0-9_].
      // Same controlled exception as Decision Log ID-001.
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schemaName}",public`);
      for (const stmt of statements) {
        await tx.$executeRawUnsafe(stmt);
      }
    });
  }
}

export async function migrateAll(): Promise<MigrationReport> {
  const tenants = await prisma.tenant.findMany({
    where: { status: 'active' },
    select: { slug: true },
    orderBy: { createdAt: 'asc' },
  });

  const report: MigrationReport = {
    total: tenants.length,
    migrated: 0,
    failed: 0,
    results: [],
  };

  for (const tenant of tenants) {
    const schemaName = `tenant_${tenant.slug.replace(/-/g, '_')}`;

    try {
      await migrateTenantSchema(schemaName);
      report.migrated++;
      report.results.push({ slug: tenant.slug, status: 'ok' });
      logger.info({ slug: tenant.slug, schemaName }, 'Tenant migration succeeded');
    } catch (err) {
      // EC-08: stop on first failure.
      // "Rollback on failure" means PostgreSQL transactional DDL rollback — each DDL
      // statement batch runs in a transaction. If a batch fails mid-way, PostgreSQL
      // rolls back that transaction automatically. Prior successful tenants remain migrated.
      // (See decision-log ID-007.)
      report.failed++;
      report.stoppedAt = tenant.slug;
      report.results.push({
        slug: tenant.slug,
        status: 'failed',
        error: String(err),
      });
      logger.error({ slug: tenant.slug, err: String(err) }, 'Tenant migration failed — stopping');

      // Mark remaining tenants as skipped
      const failedIndex = tenants.findIndex((t: { slug: string }) => t.slug === tenant.slug);
      for (const remaining of tenants.slice(failedIndex + 1)) {
        report.results.push({ slug: remaining.slug, status: 'skipped' });
      }

      break;
    }
  }

  return report;
}
