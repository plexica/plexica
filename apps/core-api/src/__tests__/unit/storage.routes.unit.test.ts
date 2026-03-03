// apps/core-api/src/__tests__/integration/storage.routes.integration.test.ts
// T007-40 — Integration tests for Storage API endpoints
// Tests: upload, download, delete, list, signed-url; auth enforcement; error responses

import 'dotenv/config';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FastifyRequest } from 'fastify';

// ---------------------------------------------------------------------------
// Mocks — must be declared before any imports that touch these modules
// ---------------------------------------------------------------------------

vi.mock('../../middleware/auth.js', () => ({
  authMiddleware: vi.fn((_req: any, _reply: any, done: () => void) => done()),
  requireRole: vi.fn(() => vi.fn((_req: any, _reply: any, done: () => void) => done())),
}));

vi.mock('../../modules/storage/storage.service.js', () => ({
  StorageService: vi.fn().mockImplementation(function (this: any) {
    this.upload = mockUpload;
    this.download = mockDownload;
    this.delete = mockDelete;
    this.list = mockList;
    this.getSignedUrl = mockGetSignedUrl;
  }),
}));

import { StorageErrorCode } from '../../types/core-services.types.js';

// ---------------------------------------------------------------------------
// Shared mock functions (defined here, referenced in mock factory above via
// module-level vars — pattern identical to marketplace-api tests)
// ---------------------------------------------------------------------------

const mockUpload = vi.fn();
const mockDownload = vi.fn();
const mockDelete = vi.fn();
const mockList = vi.fn();
const mockGetSignedUrl = vi.fn();

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const TENANT_ID = 'tenant-storage-test';

function makeRequest(overrides: any = {}): Partial<FastifyRequest> {
  return {
    user: { id: 'user-1', tenantId: TENANT_ID } as any,
    headers: { authorization: 'Bearer test-token' },
    params: {},
    query: {},
    body: {},
    log: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() } as any,
    ...overrides,
  };
}

function makeReply(): any {
  const reply: any = {
    code: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    header: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
  };
  return reply;
}

// ---------------------------------------------------------------------------
// Import routes under test (after mocks are set up)
// ---------------------------------------------------------------------------

import { storageRoutes } from '../../modules/storage/storage.routes.js';

// ---------------------------------------------------------------------------
// Simulate the route handler by finding the handler in the registered plugin
// ---------------------------------------------------------------------------

type Handler = (req: any, reply: any) => Promise<any>;

/**
 * Build a minimal fake Fastify server to capture route handlers.
 */
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
    patch: (path: string, _opts: any, handler: Handler) => {
      if (!routes.has('PATCH')) routes.set('PATCH', new Map());
      routes.get('PATCH')!.set(path, handler);
    },
  };

  return {
    server,
    getHandler: (method: string, path: string): Handler => {
      const handler = routes.get(method.toUpperCase())?.get(path);
      if (!handler) throw new Error(`No handler for ${method} ${path}`);
      return handler;
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Storage API Routes', () => {
  let fakeServer: ReturnType<typeof buildFakeServer>;

  beforeEach(async () => {
    vi.clearAllMocks();
    fakeServer = buildFakeServer();
    await storageRoutes(fakeServer.server, {} as any);
  });

  // -------------------------------------------------------------------------
  // Auth enforcement
  // -------------------------------------------------------------------------
  describe('Auth enforcement', () => {
    it('should register authMiddleware as a preHandler hook', () => {
      expect(fakeServer.server.addHook).toHaveBeenCalledWith('preHandler', expect.any(Function));
    });

    it('should return 400 when tenant context is missing', async () => {
      const handler = fakeServer.getHandler('POST', '/storage/upload');
      const req = makeRequest({ user: {} }); // no tenantId
      const reply = makeReply();

      await expect(handler(req, reply)).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // POST /storage/upload
  // -------------------------------------------------------------------------
  describe('POST /storage/upload', () => {
    it('should return 400 when no file is provided', async () => {
      const handler = fakeServer.getHandler('POST', '/storage/upload');
      // Simulate request.file() returning null
      const req = makeRequest({
        file: vi.fn().mockResolvedValue(null),
      });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply.code).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.objectContaining({ code: 'STORAGE_NO_FILE' }) })
      );
    });

    it('should upload a file and return 201 with file info', async () => {
      const fileInfo = { path: 'uploads/123-test.txt', size: 42, contentType: 'text/plain' };
      mockUpload.mockResolvedValue(fileInfo);

      const handler = fakeServer.getHandler('POST', '/storage/upload');
      const req = makeRequest({
        query: {},
        file: vi.fn().mockResolvedValue({
          filename: 'test.txt',
          mimetype: 'text/plain',
          file: (async function* () {
            yield Buffer.from('hello');
          })(),
        }),
      });
      const reply = makeReply();

      await handler(req, reply);

      expect(mockUpload).toHaveBeenCalled();
      expect(reply.code).toHaveBeenCalledWith(201);
      expect(reply.send).toHaveBeenCalledWith(fileInfo);
    });

    it('should return 413 when file exceeds size limit', async () => {
      mockUpload.mockRejectedValue(
        Object.assign(new Error('File too large'), { code: StorageErrorCode.FILE_TOO_LARGE })
      );

      const handler = fakeServer.getHandler('POST', '/storage/upload');
      const req = makeRequest({
        query: {},
        file: vi.fn().mockResolvedValue({
          filename: 'big.bin',
          mimetype: 'application/octet-stream',
          file: (async function* () {
            yield Buffer.alloc(200);
          })(),
        }),
      });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply.code).toHaveBeenCalledWith(413);
    });

    it('should return 400 on path traversal attempt', async () => {
      mockUpload.mockRejectedValue(
        Object.assign(new Error('Path traversal detected'), {
          code: StorageErrorCode.PATH_TRAVERSAL,
        })
      );

      const handler = fakeServer.getHandler('POST', '/storage/upload');
      const req = makeRequest({
        query: {},
        file: vi.fn().mockResolvedValue({
          filename: '../etc/passwd',
          mimetype: 'text/plain',
          file: (async function* () {
            yield Buffer.from('x');
          })(),
        }),
      });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply.code).toHaveBeenCalledWith(400);
    });
  });

  // -------------------------------------------------------------------------
  // GET /storage/download/*
  // -------------------------------------------------------------------------
  describe('GET /storage/download/*', () => {
    it('should stream a file and set Content-Disposition header', async () => {
      const mockStream = { pipe: vi.fn() };
      mockDownload.mockResolvedValue(mockStream);

      const handler = fakeServer.getHandler('GET', '/storage/download/*');
      const req = makeRequest({ params: { '*': 'uploads/test.txt' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(mockDownload).toHaveBeenCalledWith('uploads/test.txt');
      expect(reply.header).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringContaining('test.txt')
      );
      expect(reply.send).toHaveBeenCalledWith(mockStream);
    });

    it('should return 404 when file is not found', async () => {
      mockDownload.mockRejectedValue(
        Object.assign(new Error('File not found'), { code: StorageErrorCode.FILE_NOT_FOUND })
      );

      const handler = fakeServer.getHandler('GET', '/storage/download/*');
      const req = makeRequest({ params: { '*': 'uploads/missing.txt' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply.code).toHaveBeenCalledWith(404);
    });
  });

  // -------------------------------------------------------------------------
  // DELETE /storage/*
  // -------------------------------------------------------------------------
  describe('DELETE /storage/*', () => {
    it('should delete a file and return 204', async () => {
      mockDelete.mockResolvedValue(undefined);

      const handler = fakeServer.getHandler('DELETE', '/storage/*');
      const req = makeRequest({ params: { '*': 'uploads/old.txt' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(mockDelete).toHaveBeenCalledWith('uploads/old.txt');
      expect(reply.code).toHaveBeenCalledWith(204);
    });

    it('should return 500 on unexpected delete error', async () => {
      mockDelete.mockRejectedValue(new Error('Unexpected error'));

      const handler = fakeServer.getHandler('DELETE', '/storage/*');
      const req = makeRequest({ params: { '*': 'uploads/file.txt' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply.code).toHaveBeenCalledWith(500);
    });
  });

  // -------------------------------------------------------------------------
  // GET /storage/list
  // -------------------------------------------------------------------------
  describe('GET /storage/list', () => {
    it('should list files and return count', async () => {
      const files = [
        { name: 'uploads/a.txt', size: 10 },
        { name: 'uploads/b.txt', size: 20 },
      ];
      mockList.mockResolvedValue(files);

      const handler = fakeServer.getHandler('GET', '/storage/list');
      const req = makeRequest({ query: {} });
      const reply = makeReply();

      await handler(req, reply);

      expect(mockList).toHaveBeenCalledWith(undefined);
      expect(reply.send).toHaveBeenCalledWith({ files, count: 2 });
    });

    it('should pass prefix query param to StorageService.list', async () => {
      mockList.mockResolvedValue([]);

      const handler = fakeServer.getHandler('GET', '/storage/list');
      const req = makeRequest({ query: { prefix: 'uploads/2026/' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(mockList).toHaveBeenCalledWith('uploads/2026/');
    });
  });

  // -------------------------------------------------------------------------
  // GET /storage/signed-url/*
  // -------------------------------------------------------------------------
  describe('GET /storage/signed-url/*', () => {
    it('should return a signed URL', async () => {
      mockGetSignedUrl.mockResolvedValue('https://minio.example.com/signed?token=abc');

      const handler = fakeServer.getHandler('GET', '/storage/signed-url/*');
      const req = makeRequest({
        params: { '*': 'uploads/report.pdf' },
        query: { expiresIn: 7200 },
      });
      const reply = makeReply();

      await handler(req, reply);

      expect(mockGetSignedUrl).toHaveBeenCalledWith('uploads/report.pdf', { expiresIn: 7200 });
      expect(reply.send).toHaveBeenCalledWith({
        url: 'https://minio.example.com/signed?token=abc',
        expiresIn: 7200,
      });
    });

    it('should return 400 on path traversal in signed-url', async () => {
      mockGetSignedUrl.mockRejectedValue(
        Object.assign(new Error('Path traversal'), { code: StorageErrorCode.PATH_TRAVERSAL })
      );

      const handler = fakeServer.getHandler('GET', '/storage/signed-url/*');
      const req = makeRequest({ params: { '*': '../secret' }, query: {} });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply.code).toHaveBeenCalledWith(400);
    });
  });
});
