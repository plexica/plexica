// metrics-aggregator.service.test.ts
// Unit tests for the cross-schema metrics aggregator (S5-B01).
//
// Prisma, Redis and the logger are mocked — no real DB or Redis connection.
// tenant-schema-helpers is left real so toSchemaName + slug validation are
// exercised against the service's internal SCHEMA_NAME_REGEX defence-in-depth.
//
// vi.hoisted is used for the mock objects so they exist when the hoisted
// vi.mock factories execute (the integration project runs with isolate:false).

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    tenant: { findMany: vi.fn() },
    $queryRawUnsafe: vi.fn(),
  },
  redis: { set: vi.fn() },
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../lib/database.js', () => ({ prisma: mocks.prisma }));
vi.mock('../../lib/redis.js', () => ({ redis: mocks.redis }));
vi.mock('../../lib/logger.js', () => ({ logger: mocks.logger }));

import { aggregateMetrics } from '../../modules/admin/services/metrics-aggregator.service.js';
import { toSchemaName } from '../../lib/tenant-schema-helpers.js';

beforeEach(() => {
  mocks.prisma.tenant.findMany.mockReset();
  mocks.prisma.$queryRawUnsafe.mockReset();
  mocks.redis.set.mockReset();
});

describe('toSchemaName — schema name construction (no SQL injection)', () => {
  it('converts a valid slug into a valid tenant schema name', () => {
    expect(toSchemaName('acme')).toBe('tenant_acme');
    expect(toSchemaName('my-co')).toBe('tenant_my_co');
  });

  it('produces a schema name matching the aggregator defence-in-depth regex', () => {
    expect(toSchemaName('globex')).toMatch(/^tenant_[a-z0-9_]+$/);
  });

  it('an uppercase slug produces a schema name the aggregator rejects', () => {
    // toSchemaName does not lowercase — the aggregator's internal regex
    // (^tenant_[a-z0-9_]+$) catches a bad slug as defence-in-depth.
    expect(toSchemaName('Acme')).toBe('tenant_Acme');
    expect(/^tenant_[a-z0-9_]+$/.test(toSchemaName('Acme'))).toBe(false);
  });
});

describe('aggregateMetrics — happy path', () => {
  it('sums user/workspace counts across tenants and writes totals to Redis', async () => {
    mocks.prisma.tenant.findMany.mockResolvedValue([
      { slug: 'acme' },
      { slug: 'globex' },
    ]);
    // $queryRawUnsafe is called twice per tenant (user_profile, workspace).
    mocks.prisma.$queryRawUnsafe.mockImplementation(async (sql: string) => {
      if (sql.includes('user_profile')) return [{ count: 10 }];
      if (sql.includes('workspace')) return [{ count: 3 }];
      return [{ count: 0 }];
    });

    await aggregateMetrics();

    // Two tenants × two queries = four $queryRawUnsafe calls.
    expect(mocks.prisma.$queryRawUnsafe).toHaveBeenCalledTimes(4);
    // Verify parameterised schema name (no user input interpolation).
    for (const call of mocks.prisma.$queryRawUnsafe.mock.calls) {
      const sql = call[0] as string;
      expect(sql).toMatch(/"tenant_(acme|globex)"\.(user_profile|workspace)/);
    }
    expect(mocks.redis.set).toHaveBeenCalledWith(
      'metrics:user_count:total',
      '20'
    );
    expect(mocks.redis.set).toHaveBeenCalledWith(
      'metrics:workspace_count:total',
      '6'
    );
  });
});

describe('aggregateMetrics — per-tenant error handling', () => {
  it('skips a failing tenant but still counts the healthy ones', async () => {
    mocks.prisma.tenant.findMany.mockResolvedValue([
      { slug: 'acme' },
      { slug: 'broken' },
    ]);
    mocks.prisma.$queryRawUnsafe.mockImplementation(async (sql: string) => {
      if (sql.includes('tenant_broken')) {
        throw new Error('relation does not exist');
      }
      if (sql.includes('user_profile')) return [{ count: 7 }];
      return [{ count: 2 }];
    });

    await aggregateMetrics();

    // Only acme contributed — totals reflect the surviving tenant.
    expect(mocks.redis.set).toHaveBeenCalledWith(
      'metrics:user_count:total',
      '7'
    );
    expect(mocks.redis.set).toHaveBeenCalledWith(
      'metrics:workspace_count:total',
      '2'
    );
  });

  it('rejects a tenant whose derived schema name fails the regex', async () => {
    // Simulate a corrupted slug stored in core.tenants — the aggregator's
    // internal SCHEMA_NAME_REGEX must reject it (defence-in-depth, no SQL
    // injection via the schema identifier).
    mocks.prisma.tenant.findMany.mockResolvedValue([{ slug: 'Acme' }]);
    mocks.prisma.$queryRawUnsafe.mockResolvedValue([{ count: 99 }]);

    await aggregateMetrics();

    // The bad tenant is skipped — no $queryRawUnsafe should have run.
    expect(mocks.prisma.$queryRawUnsafe).not.toHaveBeenCalled();
    expect(mocks.redis.set).toHaveBeenCalledWith(
      'metrics:user_count:total',
      '0'
    );
    expect(mocks.redis.set).toHaveBeenCalledWith(
      'metrics:workspace_count:total',
      '0'
    );
  });
});
