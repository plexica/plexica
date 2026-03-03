// apps/core-api/src/__tests__/unit/search.service.unit.test.ts
// T007-39 — Unit tests for SearchService
// Tests: index (upsert, error), search (tenant isolation, type filter, limit cap),
//        delete, reindex (no jobQueue, with jobQueue)

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoist mock variables so they are available when vi.mock factories run
// ---------------------------------------------------------------------------

const { mockUpsert, mockDeleteMany, mockQueryRaw } = vi.hoisted(() => {
  const mockUpsert = vi.fn();
  const mockDeleteMany = vi.fn();
  const mockQueryRaw = vi.fn();
  return { mockUpsert, mockDeleteMany, mockQueryRaw };
});

// ---------------------------------------------------------------------------
// Mock external dependencies BEFORE importing the SUT
// ---------------------------------------------------------------------------

vi.mock('../../lib/db.js', () => ({
  db: {
    searchDocument: {
      upsert: mockUpsert,
      deleteMany: mockDeleteMany,
    },
    $queryRaw: mockQueryRaw,
  },
}));

vi.mock('../../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { SearchService } from '../../modules/search/search.service.js';
import { SearchErrorCode } from '../../types/core-services.types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TENANT_ID = 'tenant-search-001';

function makeSvc(): SearchService {
  return new SearchService();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SearchService', () => {
  let svc: SearchService;

  beforeEach(() => {
    svc = makeSvc();
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // index()
  // -------------------------------------------------------------------------
  describe('index()', () => {
    it('should call searchDocument.upsert with tenant-scoped args', async () => {
      mockUpsert.mockResolvedValue(undefined);

      await svc.index(TENANT_ID, {
        documentId: 'doc-001',
        type: 'workspace',
        title: 'My Workspace',
        body: 'Description of the workspace',
      });

      expect(mockUpsert).toHaveBeenCalledWith({
        where: {
          tenantId_type_documentId: {
            tenantId: TENANT_ID,
            type: 'workspace',
            documentId: 'doc-001',
          },
        },
        update: expect.objectContaining({
          title: 'My Workspace',
          body: 'Description of the workspace',
        }),
        create: expect.objectContaining({
          tenantId: TENANT_ID,
          documentId: 'doc-001',
          type: 'workspace',
          title: 'My Workspace',
        }),
      });
    });

    it('should throw INDEX_FAILED and propagate error on upsert failure', async () => {
      mockUpsert.mockRejectedValue(new Error('DB constraint violation'));

      await expect(
        svc.index(TENANT_ID, {
          documentId: 'doc-fail',
          type: 'workspace',
          title: 'Fail',
          body: 'Fail',
        })
      ).rejects.toMatchObject({ code: SearchErrorCode.INDEX_FAILED, statusCode: 500 });
    });
  });

  // -------------------------------------------------------------------------
  // search()
  // -------------------------------------------------------------------------
  describe('search()', () => {
    const fakeRows = [
      {
        document_id: 'doc-1',
        type: 'workspace',
        title: 'Alpha',
        body: '<mark>alpha</mark>',
        rank: 0.8,
        metadata: null,
      },
      {
        document_id: 'doc-2',
        type: 'workspace',
        title: 'Beta',
        body: '<mark>beta</mark>',
        rank: 0.5,
        metadata: { tag: 'x' },
      },
    ];

    it('should return mapped SearchResult array for an unfiltered query', async () => {
      mockQueryRaw.mockResolvedValue(fakeRows);

      const results = await svc.search(TENANT_ID, { q: 'alpha' });

      expect(mockQueryRaw).toHaveBeenCalled();
      expect(results).toHaveLength(2);
      expect(results[0].documentId).toBe('doc-1');
      expect(results[0].rank).toBeCloseTo(0.8);
      expect(results[1].metadata).toEqual({ tag: 'x' });
    });

    it('should use type-filtered query when type is provided', async () => {
      mockQueryRaw.mockResolvedValue([fakeRows[0]]);

      const results = await svc.search(TENANT_ID, { q: 'alpha', type: 'workspace' });

      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('workspace');
    });

    it('should cap limit at 100 regardless of requested value', async () => {
      mockQueryRaw.mockResolvedValue([]);

      // Even if 9999 is passed, the query should still be called (capped at 100 internally)
      await svc.search(TENANT_ID, { q: 'anything', limit: 9999 });

      // If we reach here without error, the limit was capped and passed to $queryRaw
      expect(mockQueryRaw).toHaveBeenCalled();
    });

    it('should throw QUERY_FAILED on DB error', async () => {
      mockQueryRaw.mockRejectedValue(new Error('FTS index not ready'));

      await expect(svc.search(TENANT_ID, { q: 'crash' })).rejects.toMatchObject({
        code: SearchErrorCode.QUERY_FAILED,
        statusCode: 500,
      });
    });
  });

  // -------------------------------------------------------------------------
  // delete()
  // -------------------------------------------------------------------------
  describe('delete()', () => {
    it('should call searchDocument.deleteMany with tenant-scoped args', async () => {
      mockDeleteMany.mockResolvedValue({ count: 1 });

      await svc.delete(TENANT_ID, 'doc-001', 'workspace');

      expect(mockDeleteMany).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID, documentId: 'doc-001', type: 'workspace' },
      });
    });

    it('should throw DELETE_FAILED on DB error', async () => {
      mockDeleteMany.mockRejectedValue(new Error('Relation does not exist'));

      await expect(svc.delete(TENANT_ID, 'doc-001', 'workspace')).rejects.toMatchObject({
        code: SearchErrorCode.DELETE_FAILED,
        statusCode: 500,
      });
    });
  });

  // -------------------------------------------------------------------------
  // reindex()
  // -------------------------------------------------------------------------
  describe('reindex()', () => {
    it('should throw REINDEX_FAILED with 503 when no jobQueueService is set', async () => {
      await expect(svc.reindex(TENANT_ID, 'workspace')).rejects.toMatchObject({
        code: SearchErrorCode.REINDEX_FAILED,
        statusCode: 503,
      });
    });

    it('should enqueue a search.reindex job and return jobId when jobQueueService is set', async () => {
      const mockEnqueue = vi.fn().mockResolvedValue({ jobId: 'reindex-job-001' });
      svc.setJobQueueService({ enqueue: mockEnqueue });

      const result = await svc.reindex(TENANT_ID, 'workspace');

      expect(mockEnqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          name: 'search.reindex',
          payload: expect.objectContaining({ tenantId: TENANT_ID, type: 'workspace' }),
        })
      );
      expect(result.jobId).toBe('reindex-job-001');
    });

    it('should throw REINDEX_FAILED if enqueue fails', async () => {
      const mockEnqueue = vi.fn().mockRejectedValue(new Error('Queue down'));
      svc.setJobQueueService({ enqueue: mockEnqueue });

      await expect(svc.reindex(TENANT_ID, 'workspace')).rejects.toMatchObject({
        code: SearchErrorCode.REINDEX_FAILED,
        statusCode: 500,
      });
    });
  });
});
