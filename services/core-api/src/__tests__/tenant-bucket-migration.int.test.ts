// tenant-bucket-migration.int.test.ts
// Canonical migration tests (spec US-006 / NFR-007, plan §3.4 / §8.2 step 1):
// up + down of migration 011 on a seeded THROWAWAY database. The dev database
// is never touched — a dedicated DB is created/dropped by this suite.
//
// Pre/post index names (recorded for the implementation report):
//   PRE  tenants_minio_bucket_key     (created by migration 002)
//   POST tenants_storage_bucket_key   (renamed by migration 011)

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { config } from '../lib/config.js';

const MIGRATION_DIR = '011_rename_minio_bucket_to_storage_bucket';
const TEST_DB = `plexica_migration_test_${process.pid}`;
const PRE_INDEX = 'tenants_minio_bucket_key';
const POST_INDEX = 'tenants_storage_bucket_key';
const SEEDED = [
  { slug: 'mig-alpha', name: 'Alpha Tenant', bucket: 'tenant-alpha' },
  { slug: 'mig-beta', name: 'Beta Tenant', bucket: 'tenant-beta' },
  { slug: 'mig-null-1', name: 'Null One', bucket: null },
  { slug: 'mig-null-2', name: 'Null Two', bucket: null },
];

function urlForDatabase(database: string): string {
  const url = new URL(config.DATABASE_URL);
  url.pathname = `/${database}`;
  return url.toString();
}

const maintenanceUrl = urlForDatabase('postgres');
const testDbUrl = urlForDatabase(TEST_DB);
const prismaBin = resolve(process.cwd(), 'node_modules/.bin/prisma');

function runPrisma(args: string[]): string {
  return execFileSync(prismaBin, args, {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: testDbUrl },
    encoding: 'utf-8',
    maxBuffer: 4 * 1024 * 1024,
  });
}

function splitStatements(sql: string): string[] {
  const body = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  const out: string[] = [];
  for (const match of body.matchAll(/DO\s+\$\$[\s\S]*?\$\$;|\S[^;]*;/g)) {
    const statement = match[0].trim();
    if (statement.length > 0) out.push(statement);
  }
  return out;
}

function downMigrationStatements(): string[] {
  const sql = readFileSync(
    resolve(process.cwd(), 'prisma/migrations', MIGRATION_DIR, 'down-migration.sql'),
    'utf-8'
  );
  return splitStatements(sql);
}

let admin: PrismaClient | undefined;
let db: PrismaClient | undefined;

async function probeDb(): Promise<boolean> {
  try {
    const probe = new PrismaClient({ datasources: { db: { url: maintenanceUrl } } });
    await probe.$queryRaw`SELECT 1`;
    await probe.$disconnect();
    return true;
  } catch {
    return false;
  }
}

const dbOk = await probeDb();

async function assertColumn(column: string): Promise<void> {
  const rows = await db!.$queryRawUnsafe(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'core' AND table_name = 'tenants' AND column_name = $1`,
    column
  );
  expect(rows).toHaveLength(1);
}

async function assertIndexNames(...expected: string[]): Promise<void> {
  const rows = (await db!.$queryRawUnsafe(
    `SELECT indexname FROM pg_indexes
     WHERE schemaname = 'core' AND tablename = 'tenants' AND indexname LIKE '%bucket%'`
  )) as Array<{ indexname: string }>;
  expect(rows.map((row) => row.indexname).sort()).toEqual([...expected].sort());
}

async function assertStoredBuckets(column: string): Promise<void> {
  const rows = (await db!.$queryRawUnsafe(
    `SELECT slug, ${column} AS bucket FROM core.tenants
     WHERE slug = ANY($1::text[]) ORDER BY slug`,
    SEEDED.map((seed) => seed.slug)
  )) as Array<{ slug: string; bucket: string | null }>;
  expect(rows).toHaveLength(SEEDED.length);
  for (let i = 0; i < SEEDED.length; i += 1) {
    expect(rows[i]!.bucket).toBe(SEEDED[i]!.bucket);
  }
}

async function expectDuplicateBucketRejected(column: string): Promise<void> {
  await expect(
    db!.$executeRawUnsafe(
      `INSERT INTO core.tenants (slug, name, ${column}) VALUES ('mig-dup', 'Dup', 'tenant-alpha')`
    )
  ).rejects.toThrow(/already exists/);
}

describe.skipIf(!dbOk)('tenant bucket column migration (011 up + down)', () => {
  beforeAll(async () => {
    admin = new PrismaClient({ datasources: { db: { url: maintenanceUrl } } });
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${TEST_DB}" WITH (FORCE)`);
    await admin.$executeRawUnsafe(`CREATE DATABASE "${TEST_DB}"`);
    await admin.$disconnect();
    admin = undefined;

    db = new PrismaClient({ datasources: { db: { url: testDbUrl } } });
    // Apply the full history, then rewind to the pre-011 state via the
    // documented down-migration so 011 is pending again and can be re-applied.
    runPrisma(['migrate', 'deploy']);
    for (const statement of downMigrationStatements()) {
      await db.$executeRawUnsafe(statement);
    }
    // Production rollback equivalent: `prisma migrate resolve --rolled-back
    // 011_rename_minio_bucket_to_storage_bucket` — the 011 folder is removed by
    // the code revert, so the row must be marked rolled-back for deploy/status.
    await db.$executeRawUnsafe(
      `DELETE FROM _prisma_migrations WHERE migration_name = $1`,
      MIGRATION_DIR
    );

    for (const seed of SEEDED) {
      await db.$executeRawUnsafe(
        `INSERT INTO core.tenants (slug, name, status, minio_bucket)
         VALUES ($1, $2, 'active', $3::varchar)`,
        seed.slug,
        seed.name,
        seed.bucket
      );
    }
  });

  afterAll(async () => {
    await db?.$disconnect();
    db = undefined;
    admin = new PrismaClient({ datasources: { db: { url: maintenanceUrl } } });
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${TEST_DB}" WITH (FORCE)`);
    await admin.$disconnect();
    admin = undefined;
  });

  it('seeds the pre-011 state with minio_bucket populated and uniqueness enforced', async () => {
    await assertColumn('minio_bucket');
    await assertIndexNames(PRE_INDEX);
    await assertStoredBuckets('minio_bucket');
    await expectDuplicateBucketRejected('minio_bucket');
  });

  it('up-migration preserves values 1:1 under the neutral storage_bucket name', async () => {
    runPrisma(['migrate', 'deploy']);
    expect(runPrisma(['migrate', 'status'])).toContain('Database schema is up to date!');

    await assertColumn('storage_bucket');
    await assertIndexNames(POST_INDEX);
    await assertStoredBuckets('storage_bucket');
    await expectDuplicateBucketRejected('storage_bucket');

    // US-006: pg_indexes must contain zero rows matching "minio" for tenant tables.
    const minioIndexes = (await db!.$queryRawUnsafe(
      `SELECT indexname FROM pg_indexes
       WHERE tablename = 'tenants' AND indexname ILIKE '%minio%'`
    )) as Array<{ indexname: string }>;
    expect(minioIndexes).toHaveLength(0);
  });

  it('down-migration restores the prior column name and values', async () => {
    for (const statement of downMigrationStatements()) {
      await db!.$executeRawUnsafe(statement);
    }
    await assertColumn('minio_bucket');
    await assertIndexNames(PRE_INDEX);
    await assertStoredBuckets('minio_bucket');
    await expectDuplicateBucketRejected('minio_bucket');
  });
});