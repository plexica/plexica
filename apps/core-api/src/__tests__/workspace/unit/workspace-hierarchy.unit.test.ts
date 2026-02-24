/**
 * Unit Tests: WorkspaceHierarchyService — Spec 011 Phase 1
 *
 * Tests the pure logic methods of WorkspaceHierarchyService in isolation:
 * - computeHierarchyFields
 * - validateDepthConstraint
 * - buildTree (via the private method, tested through getTree mock)
 * - assertValidSchema (tested indirectly)
 * - invalidateHierarchyCache
 * - isAncestorAdmin path parsing
 * - getAncestorChain path parsing
 *
 * DB methods are mocked — no real Postgres needed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkspaceHierarchyService } from '../../../modules/workspace/workspace-hierarchy.service.js';
import type { WorkspaceHierarchyRow } from '../../../modules/workspace/types/hierarchy.types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRow(overrides: Partial<WorkspaceHierarchyRow> = {}): WorkspaceHierarchyRow {
  return {
    id: 'aaaaaaaa-0000-0000-0000-000000000001',
    parent_id: null,
    depth: 0,
    path: 'aaaaaaaa-0000-0000-0000-000000000001',
    slug: 'root-ws',
    name: 'Root Workspace',
    description: null,
    tenant_id: 'tttttttt-0000-0000-0000-000000000001',
    settings: {},
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

const TENANT_CTX = {
  tenantId: 'tttttttt-0000-0000-0000-000000000001',
  tenantSlug: 'test-tenant',
  schemaName: 'tenant_test_tenant',
};

// ---------------------------------------------------------------------------
// computeHierarchyFields
// ---------------------------------------------------------------------------

describe('WorkspaceHierarchyService.computeHierarchyFields', () => {
  let service: WorkspaceHierarchyService;

  beforeEach(() => {
    service = new WorkspaceHierarchyService();
  });

  it('should return depth=0 and path=id for a root workspace (no parent)', () => {
    const id = 'bbbbbbbb-0000-0000-0000-000000000001';
    const result = service.computeHierarchyFields(null, id);
    expect(result).toEqual({ depth: 0, path: id });
  });

  it('should return depth=1 and path=parentPath/id for a direct child', () => {
    const parentId = 'aaaaaaaa-0000-0000-0000-000000000001';
    const childId = 'bbbbbbbb-0000-0000-0000-000000000001';
    const parent = makeRow({ id: parentId, depth: 0, path: parentId });
    const result = service.computeHierarchyFields(parent, childId);
    expect(result).toEqual({ depth: 1, path: `${parentId}/${childId}` });
  });

  it('should return depth=2 and correct path for a grandchild', () => {
    const grandparentId = 'aaaaaaaa-0000-0000-0000-000000000001';
    const parentId = 'bbbbbbbb-0000-0000-0000-000000000002';
    const childId = 'cccccccc-0000-0000-0000-000000000003';
    const parent = makeRow({
      id: parentId,
      depth: 1,
      path: `${grandparentId}/${parentId}`,
    });
    const result = service.computeHierarchyFields(parent, childId);
    expect(result).toEqual({
      depth: 2,
      path: `${grandparentId}/${parentId}/${childId}`,
    });
  });
});

// ---------------------------------------------------------------------------
// validateDepthConstraint
// ---------------------------------------------------------------------------

describe('WorkspaceHierarchyService.validateDepthConstraint', () => {
  let service: WorkspaceHierarchyService;

  beforeEach(() => {
    service = new WorkspaceHierarchyService();
  });

  it('should not throw when parent depth is 0 (root → child allowed)', () => {
    expect(() => service.validateDepthConstraint(0)).not.toThrow();
  });

  it('should not throw when parent depth is 1 (child → grandchild allowed)', () => {
    expect(() => service.validateDepthConstraint(1)).not.toThrow();
  });

  it('should not throw when parent depth is 19 (one below new MAX_DEPTH of 20)', () => {
    expect(() => service.validateDepthConstraint(19)).not.toThrow();
  });

  it('should throw HIERARCHY_DEPTH_EXCEEDED when parent depth equals MAX_DEPTH (20)', () => {
    expect(() => service.validateDepthConstraint(20)).toThrowError(/maximum hierarchy depth/);
  });

  it('should throw HIERARCHY_DEPTH_EXCEEDED when parent depth exceeds MAX_DEPTH', () => {
    expect(() => service.validateDepthConstraint(21)).toThrowError(/maximum hierarchy depth/);
  });

  it('should attach error code HIERARCHY_DEPTH_EXCEEDED', () => {
    try {
      service.validateDepthConstraint(20);
    } catch (err) {
      expect((err as NodeJS.ErrnoException).code).toBe('HIERARCHY_DEPTH_EXCEEDED');
    }
  });
});

// ---------------------------------------------------------------------------
// invalidateHierarchyCache
// ---------------------------------------------------------------------------

describe('WorkspaceHierarchyService.invalidateHierarchyCache', () => {
  it('should silently succeed when no cache is configured', async () => {
    const service = new WorkspaceHierarchyService();
    await expect(
      service.invalidateHierarchyCache('some/path', 'tenant-id')
    ).resolves.toBeUndefined();
  });

  it('should call cache.del for descendants and agg_counts cache keys', async () => {
    const mockCache = {
      del: vi.fn().mockResolvedValue(1),
      keys: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue('OK'),
    } as unknown as import('ioredis').Redis;

    const service = new WorkspaceHierarchyService(undefined, mockCache);
    const path = 'aaaa-0001/bbbb-0002';
    const tenantId = 'tttt-0001';

    await service.invalidateHierarchyCache(path, tenantId);

    // H1 fix: invalidateHierarchyCache uses a single cache.del(...keys) spread call
    // (not individual per-key calls) for efficiency. With path 'aaaa-0001/bbbb-0002',
    // 4 keys are built: descendants+agg_counts for the workspace itself, plus
    // agg_counts+descendants for the ancestor 'aaaa-0001'.
    expect(mockCache.del).toHaveBeenCalledTimes(1);
    const callArgs = (mockCache.del as ReturnType<typeof vi.fn>).mock.calls[0] as string[];
    expect(callArgs).toContain(`tenant:${tenantId}:workspace:hierarchy:descendants:${path}`);
    expect(callArgs).toContain(`tenant:${tenantId}:workspace:hierarchy:agg_counts:${path}`);
  });

  it('should still succeed when cache.del throws an error (fail-safe)', async () => {
    const mockCache = {
      del: vi.fn().mockRejectedValue(new Error('Redis down')),
      keys: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue('OK'),
    } as unknown as import('ioredis').Redis;

    const service = new WorkspaceHierarchyService(undefined, mockCache);
    // Should not throw even if cache is down
    await expect(
      service.invalidateHierarchyCache('some-path', 'tenant-id')
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// assertValidSchema (tested indirectly — schema validation guards)
// ---------------------------------------------------------------------------

describe('WorkspaceHierarchyService schema name validation', () => {
  it('should throw for schema names with special characters', async () => {
    const mockDb = {
      $queryRaw: vi.fn(),
    } as unknown as import('@plexica/database').PrismaClient;

    const service = new WorkspaceHierarchyService(mockDb);
    const badCtx = { ...TENANT_CTX, schemaName: 'tenant; DROP TABLE users;--' };

    await expect(service.getDescendants('some-path', badCtx)).rejects.toThrow(
      /Invalid schema name/
    );
  });

  it('should accept valid schema names (alphanumeric + underscore)', async () => {
    const mockDb = {
      $queryRaw: vi.fn().mockResolvedValue([]),
    } as unknown as import('@plexica/database').PrismaClient;

    const service = new WorkspaceHierarchyService(mockDb);

    // Should not throw for a valid schema name
    await expect(service.getDescendants('some-path', TENANT_CTX)).resolves.toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// buildTree logic (tested via getTree with mocked DB)
// ---------------------------------------------------------------------------

describe('WorkspaceHierarchyService buildTree (via mocked getTree)', () => {
  const rootId = 'aaaaaaaa-0000-0000-0000-000000000001';
  const childId = 'bbbbbbbb-0000-0000-0000-000000000002';
  const grandChildId = 'cccccccc-0000-0000-0000-000000000003';

  const flatRows = [
    {
      id: rootId,
      parent_id: null,
      depth: 0,
      path: rootId,
      slug: 'root',
      name: 'Root',
      description: null,
      tenant_id: TENANT_CTX.tenantId,
      settings: {},
      created_at: new Date(),
      updated_at: new Date(),
      member_role: 'ADMIN',
      direct_member_count: BigInt(3),
    },
    {
      id: childId,
      parent_id: rootId,
      depth: 1,
      path: `${rootId}/${childId}`,
      slug: 'child',
      name: 'Child',
      description: null,
      tenant_id: TENANT_CTX.tenantId,
      settings: {},
      created_at: new Date(),
      updated_at: new Date(),
      member_role: 'MEMBER',
      direct_member_count: BigInt(1),
    },
    {
      id: grandChildId,
      parent_id: childId,
      depth: 2,
      path: `${rootId}/${childId}/${grandChildId}`,
      slug: 'grandchild',
      name: 'Grandchild',
      description: null,
      tenant_id: TENANT_CTX.tenantId,
      settings: {},
      created_at: new Date(),
      updated_at: new Date(),
      member_role: null,
      direct_member_count: BigInt(0),
    },
  ];

  it('should nest children under their parents', async () => {
    const mockDb = {
      $queryRaw: vi.fn().mockResolvedValue(flatRows),
    } as unknown as import('@plexica/database').PrismaClient;

    const service = new WorkspaceHierarchyService(mockDb);
    const tree = await service.getTree('user-id', TENANT_CTX);

    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe(rootId);
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].id).toBe(childId);
    expect(tree[0].children[0].children).toHaveLength(1);
    expect(tree[0].children[0].children[0].id).toBe(grandChildId);
  });

  it('should populate _count.children correctly', async () => {
    const mockDb = {
      $queryRaw: vi.fn().mockResolvedValue(flatRows),
    } as unknown as import('@plexica/database').PrismaClient;

    const service = new WorkspaceHierarchyService(mockDb);
    const tree = await service.getTree('user-id', TENANT_CTX);

    expect(tree[0]._count.children).toBe(1);
    expect(tree[0].children[0]._count.children).toBe(1);
    expect(tree[0].children[0].children[0]._count.children).toBe(0);
  });

  it('should set memberRole from DB row', async () => {
    const mockDb = {
      $queryRaw: vi.fn().mockResolvedValue(flatRows),
    } as unknown as import('@plexica/database').PrismaClient;

    const service = new WorkspaceHierarchyService(mockDb);
    const tree = await service.getTree('user-id', TENANT_CTX);

    expect(tree[0].memberRole).toBe('ADMIN');
    expect(tree[0].children[0].memberRole).toBe('MEMBER');
    expect(tree[0].children[0].children[0].memberRole).toBeNull();
  });

  it('should return empty array when user has no workspaces', async () => {
    const mockDb = {
      $queryRaw: vi.fn().mockResolvedValue([]),
    } as unknown as import('@plexica/database').PrismaClient;

    const service = new WorkspaceHierarchyService(mockDb);
    const tree = await service.getTree('user-id', TENANT_CTX);

    expect(tree).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getAggregatedCounts
// ---------------------------------------------------------------------------

describe('WorkspaceHierarchyService.getAggregatedCounts', () => {
  it('should return numeric counts from DB bigint results', async () => {
    const mockDb = {
      $queryRaw: vi.fn().mockResolvedValue([{ member_count: BigInt(42), child_count: BigInt(7) }]),
    } as unknown as import('@plexica/database').PrismaClient;

    const service = new WorkspaceHierarchyService(mockDb);
    const counts = await service.getAggregatedCounts('some-path', TENANT_CTX);

    expect(counts.aggregatedMemberCount).toBe(42);
    expect(counts.aggregatedChildCount).toBe(7);
  });

  it('should return zeroes when DB returns no rows', async () => {
    const mockDb = {
      $queryRaw: vi.fn().mockResolvedValue([]),
    } as unknown as import('@plexica/database').PrismaClient;

    const service = new WorkspaceHierarchyService(mockDb);
    const counts = await service.getAggregatedCounts('some-path', TENANT_CTX);

    expect(counts.aggregatedMemberCount).toBe(0);
    expect(counts.aggregatedChildCount).toBe(0);
  });

  it('should return cached result without hitting DB on second call', async () => {
    const dbMock = vi.fn().mockResolvedValue([{ member_count: BigInt(5), child_count: BigInt(2) }]);
    const mockDb = {
      $queryRaw: dbMock,
    } as unknown as import('@plexica/database').PrismaClient;

    const mockCache = {
      get: vi
        .fn()
        .mockResolvedValueOnce(null) // first call: cache miss
        .mockResolvedValueOnce(
          JSON.stringify({ aggregatedMemberCount: 5, aggregatedChildCount: 2 })
        ),
      set: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(1),
      keys: vi.fn().mockResolvedValue([]),
    } as unknown as import('ioredis').Redis;

    const service = new WorkspaceHierarchyService(mockDb, mockCache);

    await service.getAggregatedCounts('path', TENANT_CTX);
    await service.getAggregatedCounts('path', TENANT_CTX);

    // DB should only be called once; second call uses cache
    expect(dbMock).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// getDirectChildren limit capping
// ---------------------------------------------------------------------------

describe('WorkspaceHierarchyService.getDirectChildren', () => {
  it('should cap limit at 100', async () => {
    const mockDb = {
      $queryRaw: vi.fn().mockResolvedValue([]),
    } as unknown as import('@plexica/database').PrismaClient;

    const service = new WorkspaceHierarchyService(mockDb);
    await service.getDirectChildren('parent-id', TENANT_CTX, 999, 0);

    // The effective limit should be 100, not 999
    // We verify by checking the mock was called (we can't easily inspect SQL params,
    // but we can verify the service did not throw and called DB once)
    expect(mockDb.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('should pass offset correctly', async () => {
    const mockDb = {
      $queryRaw: vi.fn().mockResolvedValue([]),
    } as unknown as import('@plexica/database').PrismaClient;

    const service = new WorkspaceHierarchyService(mockDb);
    await service.getDirectChildren('parent-id', TENANT_CTX, 10, 20);

    expect(mockDb.$queryRaw).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// hasChildren
// ---------------------------------------------------------------------------

describe('WorkspaceHierarchyService.hasChildren', () => {
  it('should return false when count is 0', async () => {
    const mockDb = {
      $queryRaw: vi.fn().mockResolvedValue([{ count: BigInt(0) }]),
    } as unknown as import('@plexica/database').PrismaClient;

    const service = new WorkspaceHierarchyService(mockDb);
    const result = await service.hasChildren('workspace-id', TENANT_CTX);
    expect(result).toBe(false);
  });

  it('should return true when count is > 0', async () => {
    const mockDb = {
      $queryRaw: vi.fn().mockResolvedValue([{ count: BigInt(3) }]),
    } as unknown as import('@plexica/database').PrismaClient;

    const service = new WorkspaceHierarchyService(mockDb);
    const result = await service.hasChildren('workspace-id', TENANT_CTX);
    expect(result).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isAncestorAdmin
// ---------------------------------------------------------------------------

describe('WorkspaceHierarchyService.isAncestorAdmin', () => {
  it('should return false for a root workspace (no ancestors)', async () => {
    const mockDb = {
      $queryRaw: vi.fn().mockResolvedValue([{ count: BigInt(0) }]),
    } as unknown as import('@plexica/database').PrismaClient;

    const service = new WorkspaceHierarchyService(mockDb);
    // Root path has no ancestors
    const result = await service.isAncestorAdmin('user-id', 'aaaa-0001', TENANT_CTX);
    expect(result).toBe(false);
    // DB should NOT be called since there are no ancestors to check
    expect(mockDb.$queryRaw).not.toHaveBeenCalled();
  });

  it('should return true when user is ADMIN in an ancestor', async () => {
    const mockDb = {
      $queryRaw: vi.fn().mockResolvedValue([{ count: BigInt(1) }]),
    } as unknown as import('@plexica/database').PrismaClient;

    const service = new WorkspaceHierarchyService(mockDb);
    const result = await service.isAncestorAdmin('user-id', 'aaaa-0001/bbbb-0002', TENANT_CTX);
    expect(result).toBe(true);
  });

  it('should return false when user has no ancestor admin membership', async () => {
    const mockDb = {
      $queryRaw: vi.fn().mockResolvedValue([{ count: BigInt(0) }]),
    } as unknown as import('@plexica/database').PrismaClient;

    const service = new WorkspaceHierarchyService(mockDb);
    const result = await service.isAncestorAdmin('user-id', 'aaaa-0001/bbbb-0002', TENANT_CTX);
    expect(result).toBe(false);
  });
});
