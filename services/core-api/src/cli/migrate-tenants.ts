// migrate-tenants.ts
// CLI entrypoint: applies the 003_core_features DDL migration to all active tenant schemas.
// Usage: pnpm --filter core-api tenant:migrate
// Safe to re-run — all DDL statements use CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.

import { disconnectDatabase } from '../lib/database.js';
import { migrateAll } from '../lib/multi-schema-migrate.js';
import { logger } from '../lib/logger.js';

async function main(): Promise<void> {
  process.stdout.write('Running tenant schema migrations…\n');

  const report = await migrateAll();

  process.stdout.write(
    `Migration complete: ${report.migrated}/${report.total} tenants migrated, ${report.failed} failed.\n`
  );

  if (report.failed > 0) {
    process.stdout.write(`Stopped at: ${report.stoppedAt ?? 'unknown'}\n`);
    for (const r of report.results) {
      if (r.status === 'failed') {
        process.stderr.write(`  FAILED [${r.slug}]: ${r.error ?? 'unknown error'}\n`);
      }
    }
    logger.error({ report }, 'Tenant migration failed');
    process.exit(1);
  }

  process.stdout.write('All tenant schemas migrated successfully.\n');
  process.exit(0);
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`Fatal error: ${String(error)}\n`);
    process.exit(1);
  })
  .finally(() => {
    void disconnectDatabase();
  });
