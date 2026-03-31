// smoke-db.test.ts
// Integration smoke test: PostgreSQL connection and core schema verification.
// Connects to the real Docker PostgreSQL instance — no mocks.

import { afterAll, describe, expect, it } from 'vitest';

import { prisma } from '../lib/database.js';

describe('PostgreSQL smoke test', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('connects to PostgreSQL and the core schema exists', async () => {
    const result = await prisma.$queryRaw<Array<{ schema_name: string }>>`
      SELECT schema_name
      FROM information_schema.schemata
      WHERE schema_name = 'core'
    `;
    expect(result).toHaveLength(1);
    expect(result[0]?.schema_name).toBe('core');
  });

  it('tenants table exists in core schema', async () => {
    const result = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'core'
        AND table_name = 'tenants'
    `;
    expect(result).toHaveLength(1);
    expect(result[0]?.table_name).toBe('tenants');
  });

  it('tenant_configs table exists in core schema', async () => {
    const result = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'core'
        AND table_name = 'tenant_configs'
    `;
    expect(result).toHaveLength(1);
    expect(result[0]?.table_name).toBe('tenant_configs');
  });

  it('TenantStatus enum has the correct values', async () => {
    // Prisma multiSchema stores enums with PascalCase names (core."TenantStatus").
    const result = await prisma.$queryRaw<Array<{ enumlabel: string }>>`
      SELECT e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
      WHERE t.typname = 'TenantStatus'
        AND n.nspname = 'core'
      ORDER BY e.enumsortorder
    `;
    const values = result.map((r) => r.enumlabel);
    expect(values).toEqual(['active', 'suspended', 'deleted']);
  });
});
