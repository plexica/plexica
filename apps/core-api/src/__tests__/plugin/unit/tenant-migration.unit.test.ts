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
      ).rejects.toThrow(`forbidden SQL keyword '${keyword}'`);
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

// ---------------------------------------------------------------------------
// Expanded FORBIDDEN_SQL_KEYWORDS tests (security hardening — Fix 2)
// Each entry maps to a keyword or pattern added beyond the original 4 DML words.
// ---------------------------------------------------------------------------

describe('TenantMigrationService — expanded SQL keyword blocklist', () => {
  let service: TenantMigrationService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TenantMigrationService();
    // Provide a tenant so the fail-fast validation runs (it runs before any DB call)
    vi.mocked(db.tenant.findMany).mockResolvedValue([ACTIVE_TENANTS[0]] as any);
  });

  const expandedCases = [
    // Destructive DDL
    { keyword: 'DROP', sql: 'DROP TABLE crm_contacts' },
    { keyword: 'TRUNCATE', sql: 'TRUNCATE TABLE crm_contacts' },
    // Privilege management
    { keyword: 'GRANT', sql: 'GRANT ALL ON crm_contacts TO app_user' },
    { keyword: 'REVOKE', sql: 'REVOKE ALL ON crm_contacts FROM app_user' },
    // Execution / file I/O — use SQL that ONLY contains the target keyword
    { keyword: 'COPY', sql: 'COPY crm_contacts (name) FROM STDIN' },
    { keyword: 'EXECUTE', sql: 'EXECUTE my_prepared_statement' },
    { keyword: 'EXEC', sql: 'EXEC my_stored_proc' },
    // DO uses dollar-quoting; SQL must not contain other blocked keywords
    { keyword: 'DO', sql: "DO $$ BEGIN RAISE NOTICE 'hello'; END $$" },
    { keyword: 'CALL', sql: 'CALL some_procedure()' },
    // Session manipulation
    { keyword: 'SET', sql: 'SET search_path TO public' },
    // Stored code creation (multi-word patterns)
    // Use SQL bodies that avoid hitting other blocked keywords
    {
      keyword: 'CREATE FUNCTION',
      sql: 'CREATE FUNCTION noop() RETURNS void LANGUAGE sql AS $$ $$ ',
    },
    {
      keyword: 'CREATE PROCEDURE',
      sql: 'CREATE PROCEDURE noop() LANGUAGE sql AS $$ $$',
    },
    // NOTE: Standard PostgreSQL trigger syntax always contains EXECUTE FUNCTION/PROCEDURE,
    // which hits the EXECUTE keyword before CREATE TRIGGER in the blocklist loop.
    // The security property is still proven: any SQL that creates a trigger is rejected.
    // We assert rejection without specifying which forbidden keyword matched.
    {
      keyword: 'CREATE TRIGGER',
      sql: 'CREATE TRIGGER trg AFTER UPDATE ON crm_contacts FOR EACH ROW EXECUTE PROCEDURE noop()',
    },
  ];

  for (const { keyword, sql } of expandedCases) {
    it(`should reject migration containing '${keyword}' (forbidden SQL keyword)`, async () => {
      await expect(
        service.runPluginMigrations('evil-plugin', [
          { name: `bad_migration_${keyword.replace(' ', '_')}`, sql },
        ])
      ).rejects.toThrow(
        // CREATE TRIGGER SQL inevitably contains EXECUTE PROCEDURE/FUNCTION, so the first
        // keyword match may be EXECUTE rather than CREATE TRIGGER. Any forbidden keyword
        // match proves the security property: trigger-creation SQL is blocked.
        keyword === 'CREATE TRIGGER'
          ? /forbidden SQL keyword '/
          : new RegExp(`forbidden SQL keyword '${keyword.replace('(', '\\(').replace(')', '\\)')}'`)
      );
    });
  }

  it('should reject DROP even when mixed-case (case-insensitive check)', async () => {
    await expect(
      service.runPluginMigrations('evil-plugin', [
        { name: 'mixed_case_drop', sql: 'drop table crm_contacts' },
      ])
    ).rejects.toThrow(/forbidden SQL keyword 'DROP'/);
  });

  it('should reject TRUNCATE at start of statement', async () => {
    await expect(
      service.runPluginMigrations('evil-plugin', [
        { name: 'truncate_test', sql: 'TRUNCATE crm_contacts RESTART IDENTITY' },
      ])
    ).rejects.toThrow(/forbidden SQL keyword 'TRUNCATE'/);
  });

  it('should NOT reject CREATE TABLE (legitimate DDL)', async () => {
    vi.mocked(db.$transaction).mockImplementation(async (fn) => {
      const tx = {
        $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
        $queryRawUnsafe: vi.fn().mockResolvedValue([]),
      };
      return fn(tx as any);
    });

    // Should not throw
    const results = await service.runPluginMigrations('good-plugin', [
      { name: '001_create', sql: 'CREATE TABLE crm_contacts (id BIGSERIAL PRIMARY KEY)' },
    ]);
    expect(results[0].success).toBe(true);
  });

  it('should NOT reject CREATE INDEX (legitimate DDL)', async () => {
    vi.mocked(db.$transaction).mockImplementation(async (fn) => {
      const tx = {
        $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
        $queryRawUnsafe: vi.fn().mockResolvedValue([]),
      };
      return fn(tx as any);
    });

    const results = await service.runPluginMigrations('good-plugin', [
      { name: '001_index', sql: 'CREATE INDEX idx_crm_contacts_email ON crm_contacts (email)' },
    ]);
    expect(results[0].success).toBe(true);
  });

  it('should NOT reject CREATE TYPE (legitimate DDL)', async () => {
    vi.mocked(db.$transaction).mockImplementation(async (fn) => {
      const tx = {
        $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
        $queryRawUnsafe: vi.fn().mockResolvedValue([]),
      };
      return fn(tx as any);
    });

    const results = await service.runPluginMigrations('good-plugin', [
      { name: '001_type', sql: "CREATE TYPE contact_status AS ENUM ('active', 'inactive')" },
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

    // NOTE: DROP is now a forbidden keyword (Fix 2 security hardening).
    // Rollback SQL must use non-destructive DDL — e.g. rename the table so the
    // schema change is reversible without data loss.
    const result = await service.rollbackPluginMigrations('test-plugin', ACTIVE_TENANTS[0].id, [
      { name: '001_rollback', sql: 'ALTER TABLE crm_contacts RENAME TO crm_contacts_archived' },
    ]);

    expect(result.success).toBe(true);
    expect(result.migrationsRun).toBe(1);
  });
});
