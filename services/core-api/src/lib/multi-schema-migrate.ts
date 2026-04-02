// multi-schema-migrate.ts
// Runs Prisma migrations against all active tenant schemas sequentially.
// Stops on first failure (EC-08) and returns a detailed MigrationReport.

import { exec } from 'node:child_process';
import { promisify } from 'node:util';

import { prisma } from './database.js';
import { logger } from './logger.js';

const execAsync = promisify(exec);

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

async function migrateTenantSchema(slug: string, schemaName: string): Promise<void> {
  const env = {
    ...process.env,
    DATABASE_URL: process.env['DATABASE_URL'] ?? '',
  };

  const schemaArg = `?schema=${schemaName}`;
  const url = env.DATABASE_URL.includes('?')
    ? `${env.DATABASE_URL}&schema=${schemaName}`
    : `${env.DATABASE_URL}${schemaArg}`;

  // L-11: Each tenant spawns a child_process for `prisma migrate deploy`.
  // For N tenants this is N process spawns — acceptable for the NFR-06 target
  // of 10 tenants < 60s, but should be replaced with a programmatic Prisma
  // migration API if tenant counts grow significantly.
  // NEW-M-5: 120s timeout prevents a stalled migration from blocking migrateAll() indefinitely.
  await execAsync('prisma migrate deploy', {
    env: { ...env, DATABASE_URL: url },
    cwd: process.cwd(),
    timeout: 120_000,
    maxBuffer: 10 * 1024 * 1024,
  });
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
      await migrateTenantSchema(tenant.slug, schemaName);
      report.migrated++;
      report.results.push({ slug: tenant.slug, status: 'ok' });
      logger.info({ slug: tenant.slug, schemaName }, 'Tenant migration succeeded');
    } catch (err) {
      // EC-08: stop on first failure
      report.failed++;
      report.stoppedAt = tenant.slug;
      report.results.push({
        slug: tenant.slug,
        status: 'failed',
        error: String(err),
      });
      logger.error({ slug: tenant.slug, err: String(err) }, 'Tenant migration failed — stopping');

      // Mark remaining tenants as skipped
      const failedIndex = tenants.findIndex((t) => t.slug === tenant.slug);
      for (const remaining of tenants.slice(failedIndex + 1)) {
        report.results.push({ slug: remaining.slug, status: 'skipped' });
      }

      break;
    }
  }

  return report;
}
