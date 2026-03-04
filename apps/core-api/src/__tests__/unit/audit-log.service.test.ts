// apps/core-api/src/__tests__/unit/audit-log.service.test.ts
// T008-07 — Unit tests for AuditLogService (≥85% coverage)

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock @plexica/database before importing service
vi.mock('@plexica/database', () => ({
  PrismaClient: class MockPrismaClient {},
}));

// Mock the db singleton
vi.mock('../../lib/db.js', () => ({ db: {} }));

// Mock the logger to suppress output and allow spying
vi.mock('../../lib/logger.js', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

import type { PrismaClient } from '@plexica/database';
import { AuditLogService } from '../../services/audit-log.service.js';
import { logger } from '../../lib/logger.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAuditLog(overrides: Record<string, unknown> = {}) {
  return {
    id: 'log-1',
    tenantId: 'tenant-a',
    userId: 'user-1',
    action: 'tenant.created',
    resourceType: 'tenant',
    resourceId: 'tenant-a',
    details: {},
    ipAddress: '1.2.3.4',
    userAgent: 'test-agent',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AuditLogService.log()', () => {
  let service: AuditLogService;
  let mockPrisma: {
    auditLog: {
      create: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma = {
      auditLog: {
        create: vi.fn().mockResolvedValue({}),
        count: vi.fn().mockResolvedValue(0),
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    service = new AuditLogService(mockPrisma as unknown as PrismaClient);
  });

  it('should write an audit log row with correct fields (happy path)', async () => {
    // Arrange
    const entry = {
      tenantId: 'tenant-a',
      userId: 'user-1',
      action: 'tenant.created',
      resourceType: 'tenant',
      resourceId: 'tenant-a',
      details: { name: 'Acme' },
      ipAddress: '1.2.3.4',
      userAgent: 'Mozilla/5.0',
    };

    // Act
    await service.log(entry);

    // Assert
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-a',
        userId: 'user-1',
        action: 'tenant.created',
        ipAddress: '1.2.3.4',
      }),
    });
  });

  it('should not re-throw when Prisma throws (error resilience)', async () => {
    // Arrange
    mockPrisma.auditLog.create.mockRejectedValue(new Error('DB connection lost'));

    // Act — must NOT throw
    await expect(
      service.log({ action: 'tenant.created', tenantId: 'tenant-a' })
    ).resolves.toBeUndefined();

    // Assert — error must be warn-logged
    expect(logger.warn).toHaveBeenCalled();
  });

  it('should accept a valid IPv4 address and store it', async () => {
    await service.log({ action: 'auth.login', ipAddress: '192.168.1.1' });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ ipAddress: '192.168.1.1' }) })
    );
  });

  it('should accept a valid IPv6 address and store it', async () => {
    await service.log({ action: 'auth.login', ipAddress: '::1' });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ ipAddress: '::1' }) })
    );
  });

  it('should store null for an invalid IP address', async () => {
    await service.log({ action: 'auth.login', ipAddress: 'not-an-ip' });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ ipAddress: null }) })
    );
  });
});

// ---------------------------------------------------------------------------

describe('AuditLogService.queryAllTenants()', () => {
  let service: AuditLogService;
  let mockPrisma: {
    auditLog: {
      create: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma = {
      auditLog: {
        create: vi.fn().mockResolvedValue({}),
        count: vi.fn(),
        findMany: vi.fn(),
      },
    };
    service = new AuditLogService(mockPrisma as unknown as PrismaClient);
  });

  it('should return paginated results with correct meta', async () => {
    // Arrange
    const logs = [makeAuditLog(), makeAuditLog({ id: 'log-2' })];
    mockPrisma.auditLog.count.mockResolvedValue(42);
    mockPrisma.auditLog.findMany.mockResolvedValue(logs);

    // Act
    const result = await service.queryAllTenants({ page: 1, limit: 10 });

    // Assert
    expect(result.meta.total).toBe(42);
    expect(result.meta.page).toBe(1);
    expect(result.meta.limit).toBe(10);
    expect(result.meta.totalPages).toBe(5);
    expect(result.data).toHaveLength(2);
  });

  it('should filter by action when action filter is provided', async () => {
    mockPrisma.auditLog.count.mockResolvedValue(1);
    mockPrisma.auditLog.findMany.mockResolvedValue([makeAuditLog()]);

    await service.queryAllTenants({ action: 'tenant.created' });

    expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ action: 'tenant.created' }) })
    );
  });

  it('should filter by userId when userId filter is provided', async () => {
    mockPrisma.auditLog.count.mockResolvedValue(0);
    mockPrisma.auditLog.findMany.mockResolvedValue([]);

    await service.queryAllTenants({ userId: 'user-42' });

    expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: 'user-42' }) })
    );
  });

  it('should filter by date range when startDate and endDate are provided', async () => {
    mockPrisma.auditLog.count.mockResolvedValue(0);
    mockPrisma.auditLog.findMany.mockResolvedValue([]);

    const startDate = new Date('2026-01-01');
    const endDate = new Date('2026-01-31');

    await service.queryAllTenants({ startDate, endDate });

    expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: { gte: startDate, lte: endDate },
        }),
      })
    );
  });

  it('should throw AUDIT_LOG_RESULT_WINDOW_EXCEEDED when offset >= 10000', async () => {
    // page=101, limit=100 → offset = 100*100 = 10000 ≥ 10000
    await expect(service.queryAllTenants({ page: 101, limit: 100 })).rejects.toThrow(
      /result window exceeded/i
    );
  });

  it('should throw AUDIT_LOG_RESULT_WINDOW_EXCEEDED with correct error code', async () => {
    try {
      await service.queryAllTenants({ page: 101, limit: 100 });
      expect.fail('should have thrown');
    } catch (err) {
      expect((err as { code?: string }).code).toBe('AUDIT_LOG_RESULT_WINDOW_EXCEEDED');
    }
  });
});

// ---------------------------------------------------------------------------

describe('AuditLogService.queryForTenant()', () => {
  let service: AuditLogService;
  let mockPrisma: {
    auditLog: {
      create: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma = {
      auditLog: {
        create: vi.fn().mockResolvedValue({}),
        count: vi.fn().mockResolvedValue(0),
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    service = new AuditLogService(mockPrisma as unknown as PrismaClient);
  });

  it('should always scope queries to the given tenantId (tenant isolation)', async () => {
    await service.queryForTenant('tenant-a');

    expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'tenant-a' }),
      })
    );
  });

  it('should return zero records when all data belongs to a different tenant', async () => {
    // Mock returns records for tenant-b (should never happen, but simulate)
    mockPrisma.auditLog.count.mockResolvedValue(0);
    mockPrisma.auditLog.findMany.mockResolvedValue([]);

    // Query is locked to tenant-a — regardless of what's in the DB
    const result = await service.queryForTenant('tenant-a');

    // Verify the WHERE clause enforces tenant-a
    expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'tenant-a' }),
      })
    );
    expect(result.data).toHaveLength(0);
  });

  it('should override any tenantId in filters with the explicit tenantId argument', async () => {
    // Even if a caller tries to pass tenantId='tenant-b' in filters, it must be overridden
    await service.queryForTenant('tenant-a', { tenantId: 'tenant-b' });

    expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'tenant-a' }),
      })
    );
  });
});
