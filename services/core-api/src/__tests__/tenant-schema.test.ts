// tenant-schema.test.ts
// Integration test: tenant schema creation happy path and duplicate error.
// Uses real PostgreSQL — no mocks.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '../lib/database.js';
import { createTenantSchema, type TenantCreationResult } from '../lib/tenant-schema.js';

const TEST_SLUG = 'smoke-test-acme';
const TEST_SCHEMA = 'tenant_smoke_test_acme';

describe('Tenant schema creation', () => {
  let creationResult: TenantCreationResult;

  beforeAll(async () => {
    // Create the tenant schema once before all verification tests.
    // Each test below asserts a different aspect of the resulting DB state.
    creationResult = await createTenantSchema(TEST_SLUG);
  });

  afterAll(async () => {
    // Cleanup: drop test schema and tenant records
    try {
      await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${TEST_SCHEMA}" CASCADE`);
      await prisma.tenantConfig.deleteMany({
        where: { tenant: { slug: TEST_SLUG } },
      });
      await prisma.tenant.deleteMany({ where: { slug: TEST_SLUG } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it('creates tenant schema successfully (happy path)', () => {
    expect(creationResult.success).toBe(true);
    expect(creationResult.schemaName).toBe(TEST_SCHEMA);
    expect(creationResult.tenantId).toBeDefined();
  });

  it('creates a PostgreSQL schema with the correct name', async () => {
    const rows = await prisma.$queryRaw<Array<{ schema_name: string }>>`
      SELECT schema_name
      FROM information_schema.schemata
      WHERE schema_name = ${TEST_SCHEMA}
    `;
    expect(rows).toHaveLength(1);
  });

  it('inserts a record in core.tenants', async () => {
    const tenant = await prisma.tenant.findUnique({ where: { slug: TEST_SLUG } });
    expect(tenant).not.toBeNull();
    expect(tenant?.slug).toBe(TEST_SLUG);
    expect(tenant?.status).toBe('active');
  });

  it('inserts a record in core.tenant_configs', async () => {
    const tenant = await prisma.tenant.findUnique({ where: { slug: TEST_SLUG } });
    expect(tenant).not.toBeNull();
    if (tenant === null) throw new Error('Tenant not found — test precondition failed');

    const config = await prisma.tenantConfig.findUnique({
      where: { tenantId: tenant.id },
    });
    expect(config).not.toBeNull();
    expect(config?.keycloakRealm).toBe(`plexica-${TEST_SLUG}`);
  });

  it('rejects duplicate slug with ALREADY_EXISTS error', async () => {
    const result = await createTenantSchema(TEST_SLUG);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('ALREADY_EXISTS');
    expect(result.error?.message).toContain(TEST_SCHEMA);
  });

  it('rejects invalid slug format', async () => {
    const result = await createTenantSchema('INVALID_SLUG!!');
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INVALID_SLUG');
  });
});
