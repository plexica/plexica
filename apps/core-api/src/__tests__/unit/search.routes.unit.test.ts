// apps/core-api/src/__tests__/unit/search.routes.unit.test.ts
// T007-43 — Unit tests for Search API routes (fake-server pattern, no real DB)

import 'dotenv/config';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FastifyRequest } from 'fastify';
import { SearchService } from '../../modules/search/search.service.js';
import { JobQueueService } from '../../modules/jobs/job-queue.service.js';
import { JobRepository } from '../../modules/jobs/job.repository.js';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockSearch, mockIndex, mockDelete, mockReindex, mockSetJobQueueService } = vi.hoisted(
  () => ({
    mockSearch: vi.fn(),
    mockIndex: vi.fn(),
    mockDelete: vi.fn(),
    mockReindex: vi.fn(),
    mockSetJobQueueService: vi.fn(),
  })
);

// Must mock redis + bullmq before search.routes.ts is imported
// (search.routes imports JobRepository and JobQueueService which import bullmq/redis)
vi.mock('../../lib/redis.js', () => ({
  redis: { options: {}, on: vi.fn(), status: 'ready' },
  default: { options: {}, on: vi.fn(), status: 'ready' },
}));

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(function (this: any) {
    this.add = vi.fn();
    this.close = vi.fn();
    this.upsertJobScheduler = vi.fn();
  }),
  Worker: vi.fn().mockImplementation(function (this: any) {
    this.close = vi.fn();
  }),
}));

vi.mock('../../middleware/auth.js', () => ({
  authMiddleware: vi.fn((_req: any, _reply: any, done: () => void) => done()),
  requireRole: vi.fn(() => vi.fn((_req: any, _reply: any, done: () => void) => done())),
}));

vi.mock('../../modules/search/search.service.js', () => ({
  SearchService: vi.fn().mockImplementation(function (this: any) {
    this.search = mockSearch;
    this.index = mockIndex;
    this.delete = mockDelete;
    this.reindex = mockReindex;
    this.setJobQueueService = mockSetJobQueueService;
  }),
}));

vi.mock('../../modules/jobs/job-queue.service.js', () => ({
  JobQueueService: vi.fn().mockImplementation(function (this: any) {
    this.enqueue = vi.fn();
    this.schedule = vi.fn();
    this.getStatus = vi.fn();
    this.cancel = vi.fn();
  }),
  QUEUE_NAME: 'plexica-jobs',
}));

vi.mock('../../modules/jobs/job.repository.js', () => ({
  JobRepository: vi.fn().mockImplementation(function (this: any) {
    this.list = vi.fn();
    this.findById = vi.fn();
    this.create = vi.fn();
    this.updateStatus = vi.fn();
  }),
}));

// ---------------------------------------------------------------------------
// Import route under test (after mocks)
// ---------------------------------------------------------------------------

import { searchRoutes } from '../../modules/search/search.routes.js';
import { SearchErrorCode } from '../../types/core-services.types.js';

// Cast to vi.fn() to re-apply mock implementation in beforeEach
const MockSearchService = SearchService as unknown as ReturnType<typeof vi.fn>;
const MockJobQueueService = JobQueueService as unknown as ReturnType<typeof vi.fn>;
const MockJobRepository = JobRepository as unknown as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Fake server builder
// ---------------------------------------------------------------------------

type Handler = (req: any, reply: any) => Promise<any>;

function buildFakeServer() {
  const routes: Map<string, Map<string, Handler>> = new Map();

  const server: any = {
    addHook: vi.fn(),
    post: (path: string, _opts: any, handler: Handler) => {
      if (!routes.has('POST')) routes.set('POST', new Map());
      routes.get('POST')!.set(path, handler);
    },
    get: (path: string, _opts: any, handler: Handler) => {
      if (!routes.has('GET')) routes.set('GET', new Map());
      routes.get('GET')!.set(path, handler);
    },
    delete: (path: string, _opts: any, handler: Handler) => {
      if (!routes.has('DELETE')) routes.set('DELETE', new Map());
      routes.get('DELETE')!.set(path, handler);
    },
  };

  return {
    server,
    getHandler: (method: string, path: string): Handler => {
      const handler = routes.get(method.toUpperCase())?.get(path);
      if (!handler) throw new Error(`No handler registered for ${method} ${path}`);
      return handler;
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TENANT_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-000000000002';
const USER_ID = 'user-search-1';

function makeRequest(overrides: any = {}): Partial<FastifyRequest> {
  return {
    user: { id: USER_ID, tenantId: TENANT_ID } as any,
    headers: { authorization: 'Bearer test-token' },
    params: {},
    query: {},
    body: {},
    log: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() } as any,
    ...overrides,
  };
}

function makeReply() {
  const reply: any = {
    code: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    header: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
  };
  return reply;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Search API Routes', () => {
  let fakeServer: ReturnType<typeof buildFakeServer>;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Re-apply constructor mocks after vi.clearAllMocks()
    MockSearchService.mockImplementation(function (this: any) {
      this.search = mockSearch;
      this.index = mockIndex;
      this.delete = mockDelete;
      this.reindex = mockReindex;
      this.setJobQueueService = mockSetJobQueueService;
    });

    MockJobQueueService.mockImplementation(function (this: any) {
      this.enqueue = vi.fn();
      this.schedule = vi.fn();
    });

    MockJobRepository.mockImplementation(function (this: any) {
      this.list = vi.fn();
      this.findById = vi.fn();
      this.create = vi.fn();
    });

    // Safe defaults
    mockSearch.mockResolvedValue([]);
    mockIndex.mockResolvedValue(undefined);
    mockDelete.mockResolvedValue(undefined);
    mockReindex.mockResolvedValue({ jobId: 'reindex-job-1' });
    mockSetJobQueueService.mockReturnValue(undefined);

    fakeServer = buildFakeServer();
    await searchRoutes(fakeServer.server, {} as any);
  });

  // -------------------------------------------------------------------------
  // Auth enforcement
  // -------------------------------------------------------------------------
  describe('Auth enforcement', () => {
    it('should register authMiddleware as a preHandler hook', () => {
      expect(fakeServer.server.addHook).toHaveBeenCalledWith('preHandler', expect.any(Function));
    });

    it('should throw when tenant context is missing from request', async () => {
      const handler = fakeServer.getHandler('POST', '/search');
      const req = makeRequest({ user: {} });
      const reply = makeReply();

      await expect(handler(req, reply)).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // POST /search
  // -------------------------------------------------------------------------
  describe('POST /search', () => {
    it('should return 400 when query is missing', async () => {
      const handler = fakeServer.getHandler('POST', '/search');
      const req = makeRequest({ body: { type: 'workspace' } }); // missing q
      const reply = makeReply();

      await handler(req, reply);

      expect(reply.code).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.objectContaining({ code: 'VALIDATION_ERROR' }) })
      );
    });

    it('should search and return results', async () => {
      const results = [
        { documentId: 'doc-1', title: 'Workspace Alpha', score: 0.9 },
        { documentId: 'doc-2', title: 'Workspace Beta', score: 0.7 },
      ];
      mockSearch.mockResolvedValue(results);

      const handler = fakeServer.getHandler('POST', '/search');
      const req = makeRequest({ body: { q: 'workspace', type: 'workspace', limit: 10 } });
      const reply = makeReply();

      await handler(req, reply);

      expect(mockSearch).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ q: 'workspace' })
      );
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ results, count: 2, query: 'workspace' })
      );
    });

    it('should return 500 on search service failure', async () => {
      mockSearch.mockRejectedValue(new Error('DB error'));

      const handler = fakeServer.getHandler('POST', '/search');
      const req = makeRequest({ body: { q: 'fail' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply.code).toHaveBeenCalledWith(500);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({ code: SearchErrorCode.QUERY_FAILED }),
        })
      );
    });
  });

  // -------------------------------------------------------------------------
  // POST /search/index
  // -------------------------------------------------------------------------
  describe('POST /search/index', () => {
    it('should return 400 for invalid indexable document', async () => {
      const handler = fakeServer.getHandler('POST', '/search/index');
      const req = makeRequest({ body: { title: 'No ID or type' } }); // missing documentId, type, body
      const reply = makeReply();

      await handler(req, reply);

      expect(reply.code).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.objectContaining({ code: 'VALIDATION_ERROR' }) })
      );
    });

    it('should index a document and return 201', async () => {
      const handler = fakeServer.getHandler('POST', '/search/index');
      const req = makeRequest({
        body: {
          documentId: 'workspace-abc',
          type: 'workspace',
          title: 'My Workspace',
          body: 'Workspace used by team A',
        },
      });
      const reply = makeReply();

      await handler(req, reply);

      expect(mockIndex).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ documentId: 'workspace-abc' })
      );
      expect(reply.code).toHaveBeenCalledWith(201);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ documentId: 'workspace-abc' })
      );
    });

    it('should return 500 on indexing failure', async () => {
      mockIndex.mockRejectedValue(new Error('Index write failed'));

      const handler = fakeServer.getHandler('POST', '/search/index');
      const req = makeRequest({
        body: {
          documentId: 'doc-fail',
          type: 'workspace',
          title: 'Failing Doc',
          body: 'Content',
        },
      });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply.code).toHaveBeenCalledWith(500);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({ code: SearchErrorCode.INDEX_FAILED }),
        })
      );
    });
  });

  // -------------------------------------------------------------------------
  // DELETE /search/:documentId
  // -------------------------------------------------------------------------
  describe('DELETE /search/:documentId', () => {
    it('should return 400 when type query param is missing', async () => {
      const handler = fakeServer.getHandler('DELETE', '/search/:documentId');
      const req = makeRequest({ params: { documentId: 'doc-1' }, query: {} }); // no type
      const reply = makeReply();

      await handler(req, reply);

      expect(reply.code).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.objectContaining({ code: 'VALIDATION_ERROR' }) })
      );
    });

    it('should delete a document and return 204', async () => {
      const handler = fakeServer.getHandler('DELETE', '/search/:documentId');
      const req = makeRequest({
        params: { documentId: 'doc-xyz' },
        query: { type: 'workspace' },
      });
      const reply = makeReply();

      await handler(req, reply);

      expect(mockDelete).toHaveBeenCalledWith(TENANT_ID, 'doc-xyz', 'workspace');
      expect(reply.code).toHaveBeenCalledWith(204);
    });

    it('should return 500 on delete failure', async () => {
      mockDelete.mockRejectedValue(new Error('Delete failed'));

      const handler = fakeServer.getHandler('DELETE', '/search/:documentId');
      const req = makeRequest({
        params: { documentId: 'doc-fail' },
        query: { type: 'workspace' },
      });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply.code).toHaveBeenCalledWith(500);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({ code: SearchErrorCode.DELETE_FAILED }),
        })
      );
    });
  });

  // -------------------------------------------------------------------------
  // POST /search/reindex
  // -------------------------------------------------------------------------
  describe('POST /search/reindex', () => {
    it('should return 400 when type is missing from body', async () => {
      const handler = fakeServer.getHandler('POST', '/search/reindex');
      const req = makeRequest({ body: {} }); // no type
      const reply = makeReply();

      await handler(req, reply);

      expect(reply.code).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.objectContaining({ code: 'VALIDATION_ERROR' }) })
      );
    });

    it('should enqueue a reindex job and return 202', async () => {
      const reindexResult = { jobId: 'reindex-job-99', type: 'workspace' };
      mockReindex.mockResolvedValue(reindexResult);

      const handler = fakeServer.getHandler('POST', '/search/reindex');
      const req = makeRequest({ body: { type: 'workspace' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(mockReindex).toHaveBeenCalledWith(TENANT_ID, 'workspace');
      expect(reply.code).toHaveBeenCalledWith(202);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Reindex job enqueued', jobId: 'reindex-job-99' })
      );
    });

    it('should return 500 on reindex failure', async () => {
      mockReindex.mockRejectedValue(new Error('Queue unavailable'));

      const handler = fakeServer.getHandler('POST', '/search/reindex');
      const req = makeRequest({ body: { type: 'workspace' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply.code).toHaveBeenCalledWith(500);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({ code: SearchErrorCode.REINDEX_FAILED }),
        })
      );
    });
  });
});
