// apps/core-api/src/__tests__/plugin/unit/tenant-migration.unit.test.ts
//
// Unit tests for TenantMigrationService (T004-04, T004-22)
// Tests focus on:
//   - Per-tenant isolation (one failure doesn't propagate to other tenants)
//   - DDL-only validation (SELECT statement rejection)
//   - Migration idempotency (already-applied migrations skipped)
//
// Constitution Article 8.2: Deterministic, independent, descriptive names

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TenantMigrationService } from '../../../services/tenant-migration.service.js';
import { db } from '../../../lib/db.js';
import { TENANT_STATUS } from '../../../constants/index.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../../lib/db.js', () => ({
  db: {
    tenant: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
    $executeRawUnsafe: vi.fn(),
    $queryRawUnsafe: vi.fn(),
  },
}));

vi.mock('../../../services/tenant.service.js', () => ({
  tenantService: {
    getSchemaName: (slug: string) => `tenant_${slug.replace(/-/g, '_')}`,
  },
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ACTIVE_TENANTS = [
  { id: 'tenant-1', slug: 'acme-corp' },
  { id: 'tenant-2', slug: 'globex' },
];

const SIMPLE_DDL_MIGRATION = {
  name: '001_create_crm_contacts',
  sql: 'CREATE TABLE crm_contacts (id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL)',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TenantMigrationService.runPluginMigrations', () => {
  let service: TenantMigrationService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TenantMigrationService();
  });

  it('should return empty array when no migrations provided', async () => {
    const results = await service.runPluginMigrations('test-plugin', []);
    expect(results).toEqual([]);
    expect(db.tenant.findMany).not.toHaveBeenCalled();
  });

  it('should run migrations for all active tenants', async () => {
    vi.mocked(db.tenant.findMany).mockResolvedValue(ACTIVE_TENANTS as any);

    // Simulate successful transaction for each tenant
    vi.mocked(db.$transaction).mockImplementation(async (fn) => {
      const tx = {
        $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
        $queryRawUnsafe: vi.fn().mockResolvedValue([]), // no existing migrations
      };
      return fn(tx as any);
    });

    const results = await service.runPluginMigrations('test-plugin', [SIMPLE_DDL_MIGRATION]);

    expect(results).toHaveLength(2);
    expect(results[0].success).toBe(true);
    expect(results[0].migrationsRun).toBe(1);
    expect(results[1].success).toBe(true);
    expect(results[1].migrationsRun).toBe(1);
  });

  it('should isolate failures — one tenant failure does not affect others', async () => {
    vi.mocked(db.tenant.findMany).mockResolvedValue(ACTIVE_TENANTS as any);

    let callCount = 0;
    vi.mocked(db.$transaction).mockImplementation(async (fn) => {
      callCount++;
      if (callCount === 1) {
        // First tenant fails
        throw new Error('DDL error: table already exists');
      }
      // Second tenant succeeds
      const tx = {
        $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
        $queryRawUnsafe: vi.fn().mockResolvedValue([]),
      };
      return fn(tx as any);
    });

    const results = await service.runPluginMigrations('test-plugin', [SIMPLE_DDL_MIGRATION]);

    expect(results).toHaveLength(2);
    expect(results[0].success).toBe(false);
    expect(results[0].error).toContain('DDL error');
    expect(results[1].success).toBe(true);
    expect(results[1].migrationsRun).toBe(1);
  });

  it('should skip already-applied migrations (idempotent)', async () => {
    vi.mocked(db.tenant.findMany).mockResolvedValue([ACTIVE_TENANTS[0]] as any);

    vi.mocked(db.$transaction).mockImplementation(async (fn) => {
      const tx = {
        $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
        // Return existing migration record → migration should be skipped
        $queryRawUnsafe: vi.fn().mockResolvedValue([{ id: 42 }]),
      };
      return fn(tx as any);
    });

    const results = await service.runPluginMigrations('test-plugin', [SIMPLE_DDL_MIGRATION]);

    expect(results[0].success).toBe(true);
    expect(results[0].migrationsRun).toBe(0); // Skipped — already applied
  });
});

describe('TenantMigrationService — DDL-only validation', () => {
  let service: TenantMigrationService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TenantMigrationService();
  });

  const dmlCases = [
    { keyword: 'SELECT', sql: 'SELECT * FROM core.plugins' },
    { keyword: 'INSERT', sql: "INSERT INTO crm_contacts (name) VALUES ('test')" },
    { keyword: 'UPDATE', sql: "UPDATE crm_contacts SET name = 'x' WHERE id = 1" },
    { keyword: 'DELETE', sql: 'DELETE FROM crm_contacts WHERE id = 1' },
  ];

  for (const { keyword, sql } of dmlCases) {
    it(`should reject migration containing ${keyword} (DML forbidden)`, async () => {
      vi.mocked(db.tenant.findMany).mockResolvedValue([ACTIVE_TENANTS[0]] as any);

      await expect(
        service.runPluginMigrations('evil-plugin', [{ name: `bad_migration_${keyword}`, sql }])
      ).rejects.toThrow(`forbidden DML keyword '${keyword}'`);
    });
  }

  it('should accept valid DDL migration (CREATE TABLE)', async () => {
    vi.mocked(db.tenant.findMany).mockResolvedValue([ACTIVE_TENANTS[0]] as any);
    vi.mocked(db.$transaction).mockImplementation(async (fn) => {
      const tx = {
        $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
        $queryRawUnsafe: vi.fn().mockResolvedValue([]),
      };
      return fn(tx as any);
    });

    const results = await service.runPluginMigrations('test-plugin', [
      {
        name: '001_create_table',
        sql: 'CREATE TABLE crm_contacts (id BIGSERIAL PRIMARY KEY)',
      },
    ]);

    expect(results[0].success).toBe(true);
  });

  it('should accept ALTER TABLE DDL', async () => {
    vi.mocked(db.tenant.findMany).mockResolvedValue([ACTIVE_TENANTS[0]] as any);
    vi.mocked(db.$transaction).mockImplementation(async (fn) => {
      const tx = {
        $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
        $queryRawUnsafe: vi.fn().mockResolvedValue([]),
      };
      return fn(tx as any);
    });

    const results = await service.runPluginMigrations('test-plugin', [
      {
        name: '002_add_column',
        sql: 'ALTER TABLE crm_contacts ADD COLUMN email TEXT',
      },
    ]);

    expect(results[0].success).toBe(true);
  });
});

describe('TenantMigrationService.rollbackPluginMigrations', () => {
  let service: TenantMigrationService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TenantMigrationService();
  });

  it('should return failure result when tenant not found', async () => {
    vi.mocked(db.tenant.findUnique).mockResolvedValue(null);

    const result = await service.rollbackPluginMigrations('test-plugin', 'nonexistent-tenant', [
      { name: '001_rollback', sql: 'DROP TABLE IF EXISTS crm_contacts' },
    ]);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Tenant not found');
  });

  it('should execute rollback DDL in a transaction', async () => {
    vi.mocked(db.tenant.findUnique).mockResolvedValue(ACTIVE_TENANTS[0] as any);

    const executeMock = vi.fn().mockResolvedValue(undefined);
    vi.mocked(db.$transaction).mockImplementation(async (fn) => {
      const tx = {
        $executeRawUnsafe: executeMock,
        $queryRawUnsafe: vi.fn().mockResolvedValue([]),
      };
      return fn(tx as any);
    });

    const result = await service.rollbackPluginMigrations('test-plugin', ACTIVE_TENANTS[0].id, [
      { name: '001_rollback', sql: 'DROP TABLE IF EXISTS crm_contacts' },
    ]);

    expect(result.success).toBe(true);
    expect(result.migrationsRun).toBe(1);
  });
});
