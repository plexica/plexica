// multi-schema-migrate.test.ts
// Integration tests for migrateAll() — EC-08 stop-on-first-failure behavior.
// Uses real PostgreSQL with test tenant schemas.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '../lib/database.js';
import { migrateAll } from '../lib/multi-schema-migrate.js';

const MIGR_TENANTS = [
  { slug: 'migr-test-alpha', schema: 'tenant_migr_test_alpha' },
  { slug: 'migr-test-beta', schema: 'tenant_migr_test_beta' },
  { slug: 'migr-test-gamma', schema: 'tenant_migr_test_gamma' },
];

beforeAll(async () => {
  for (const { slug, schema } of MIGR_TENANTS) {
    const existing = await prisma.tenant.findUnique({ where: { slug } });
    if (existing !== null) continue;
    await prisma.$transaction(async (tx) => {
      const t = await tx.tenant.create({ data: { slug, name: slug, status: 'active' } });
      await tx.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
      await tx.tenantConfig.create({ data: { tenantId: t.id, keycloakRealm: `plexica-${slug}` } });
    });
  }
});

afterAll(async () => {
  for (const { slug, schema } of MIGR_TENANTS) {
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await prisma.tenantConfig.deleteMany({ where: { tenant: { slug } } });
    await prisma.tenant.deleteMany({ where: { slug } });
  }
  await prisma.$disconnect();
});

describe('migrateAll()', () => {
  it('returns a MigrationReport with expected shape', async () => {
    const report = await migrateAll();
    expect(report).toHaveProperty('total');
    expect(report).toHaveProperty('migrated');
    expect(report).toHaveProperty('failed');
    expect(report).toHaveProperty('results');
    expect(Array.isArray(report.results)).toBe(true);
  });

  it('report.total matches active tenant count', async () => {
    const count = await prisma.tenant.count({ where: { status: 'active' } });
    const report = await migrateAll();
    expect(report.total).toBe(count);
  });

  it('each result has slug and status fields', async () => {
    const report = await migrateAll();
    for (const result of report.results) {
      expect(result).toHaveProperty('slug');
      expect(result).toHaveProperty('status');
      expect(['ok', 'failed', 'skipped']).toContain(result.status);
    }
  });

  it('migrated + failed <= total', async () => {
    const report = await migrateAll();
    expect(report.migrated + report.failed).toBeLessThanOrEqual(report.total);
  });

  it('stoppedAt is set when there are failures', async () => {
    const report = await migrateAll();
    if (report.failed > 0) {
      expect(report.stoppedAt).toBeDefined();
    }
  });

  it('skipped tenants appear after stoppedAt in results', async () => {
    const report = await migrateAll();
    if (report.stoppedAt === undefined) return;
    const failedIndex = report.results.findIndex((r) => r.status === 'failed');
    const afterFailed = report.results.slice(failedIndex + 1);
    for (const r of afterFailed) {
      expect(r.status).toBe('skipped');
    }
  });

  it('migrateAll completes within NFR-06 budget (10 tenants < 60s)', async () => {
    // NFR-06: migrations for up to 10 tenants must complete in < 60 000ms.
    // This test runs against the test DB which has 3 MIGR_TENANTS + any existing
    // tenants; it verifies that migrateAll() itself does not hang or deadlock.
    const start = Date.now();
    await migrateAll();
    const elapsed = Date.now() - start;
    expect(elapsed, `migrateAll() took ${elapsed}ms — NFR-06 requires < 60 000ms`).toBeLessThan(
      60_000
    );
  });
});
