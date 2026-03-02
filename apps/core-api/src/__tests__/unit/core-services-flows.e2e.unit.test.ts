// apps/core-api/src/__tests__/e2e/core-services-flows.e2e.test.ts
// T007-47 — E2E flow tests: upload-file flow, search flow, notification flow
//
// These tests verify complete multi-step user flows through the Core Services
// API using the fake-server pattern (no real MinIO/SMTP/Redis required).
// Each test scenario drives multiple HTTP-like calls through route handlers,
// asserting that services are called correctly and responses are coherent.

import 'dotenv/config';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FastifyRequest } from 'fastify';

// ---------------------------------------------------------------------------
// Hoisted mocks — declared before module imports that resolve them
// ---------------------------------------------------------------------------

const {
  // Storage
  mockUpload,
  mockDownload,
  mockDelete: mockStorageDelete,
  mockList,
  mockGetSignedUrl,
  // Notifications
  mockSend,
  mockSendBulk,
  mockListForUser,
  mockGetUnreadCount,
  mockMarkAllAsRead,
  // Jobs
  mockEnqueue,
  mockSchedule,
  mockGetStatus,
  mockCancel,
  mockRepoList,
  mockRepoFindById,
  // Search
  mockSearch,
  mockIndex,
  mockSearchDelete,
  mockReindex,
} = vi.hoisted(() => ({
  mockUpload: vi.fn(),
  mockDownload: vi.fn(),
  mockDelete: vi.fn(),
  mockList: vi.fn(),
  mockGetSignedUrl: vi.fn(),
  mockSend: vi.fn(),
  mockSendBulk: vi.fn(),
  mockListForUser: vi.fn(),
  mockGetUnreadCount: vi.fn(),
  mockMarkAllAsRead: vi.fn(),
  mockEnqueue: vi.fn(),
  mockSchedule: vi.fn(),
  mockGetStatus: vi.fn(),
  mockCancel: vi.fn(),
  mockRepoList: vi.fn(),
  mockRepoFindById: vi.fn(),
  mockSearch: vi.fn(),
  mockIndex: vi.fn(),
  mockSearchDelete: vi.fn(),
  mockReindex: vi.fn(),
}));

// Auth middleware — pass-through
vi.mock('../../middleware/auth.js', () => ({
  authMiddleware: vi.fn((_req: any, _reply: any, done: () => void) => done()),
  // requireRole is called at route-registration time; return a no-op preHandler
  requireRole: vi.fn(() => vi.fn((_req: any, _reply: any, done: () => void) => done())),
}));

// Redis (BullMQ transitive dep)
vi.mock('../../lib/redis.js', () => ({
  redis: { options: {}, on: vi.fn(), status: 'ready' },
  default: { options: {}, on: vi.fn(), status: 'ready' },
}));

// BullMQ
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

// Nodemailer
vi.mock('nodemailer', () => ({
  default: { createTransport: vi.fn(() => ({ sendMail: vi.fn() })) },
  createTransport: vi.fn(() => ({ sendMail: vi.fn() })),
}));

// Service mocks
vi.mock('../../modules/storage/storage.service.js', () => ({
  StorageService: vi.fn().mockImplementation(function (this: any) {
    this.upload = mockUpload;
    this.download = mockDownload;
    this.delete = mockStorageDelete;
    this.list = mockList;
    this.getSignedUrl = mockGetSignedUrl;
  }),
}));

vi.mock('../../modules/notifications/notification.service.js', () => ({
  NotificationService: vi.fn().mockImplementation(function (this: any) {
    this.send = mockSend;
    this.sendBulk = mockSendBulk;
  }),
}));

vi.mock('../../modules/notifications/notification.repository.js', () => ({
  NotificationRepository: vi.fn().mockImplementation(function (this: any) {
    this.listForUser = mockListForUser;
    this.getUnreadCount = mockGetUnreadCount;
    this.markAsRead = vi.fn();
    this.markAllAsRead = mockMarkAllAsRead;
    this.create = vi.fn();
    this.updateStatus = vi.fn();
    this.findByUserId = vi.fn();
  }),
}));

vi.mock('../../modules/jobs/job-queue.service.js', () => ({
  JobQueueService: vi.fn().mockImplementation(function (this: any) {
    this.enqueue = mockEnqueue;
    this.schedule = mockSchedule;
    this.getStatus = mockGetStatus;
    this.cancel = mockCancel;
  }),
  QUEUE_NAME: 'plexica-jobs',
}));

vi.mock('../../modules/jobs/job.repository.js', () => ({
  JobRepository: vi.fn().mockImplementation(function (this: any) {
    this.list = mockRepoList;
    this.findById = mockRepoFindById;
    this.create = vi.fn();
    this.updateStatus = vi.fn();
  }),
}));

vi.mock('../../modules/search/search.service.js', () => ({
  SearchService: vi.fn().mockImplementation(function (this: any) {
    this.search = mockSearch;
    this.index = mockIndex;
    this.delete = mockSearchDelete;
    this.reindex = mockReindex;
    this.setJobQueueService = vi.fn();
  }),
}));

vi.mock('../../modules/jobs/job-worker.js', () => ({
  JobWorker: vi.fn().mockImplementation(function (this: any) {
    this.start = vi.fn();
    this.stop = vi.fn();
  }),
}));

vi.mock('../../modules/storage/bucket-provisioner.js', () => ({
  BucketProvisioner: vi.fn().mockImplementation(function (this: any) {
    this.provisionTenantBucket = vi.fn().mockResolvedValue(undefined);
  }),
}));

// ---------------------------------------------------------------------------
// Route imports (after mocks)
// ---------------------------------------------------------------------------

import { storageRoutes } from '../../modules/storage/storage.routes.js';
import { notificationRoutes } from '../../modules/notifications/notification.routes.js';
import { jobsRoutes } from '../../modules/jobs/jobs.routes.js';
import { searchRoutes } from '../../modules/search/search.routes.js';
import {
  StorageErrorCode,
  NotificationErrorCode,
  JobErrorCode,
} from '../../types/core-services.types.js';

// ---------------------------------------------------------------------------
// Test-app factory — registers all four route plugins in one fake Fastify
// ---------------------------------------------------------------------------

type Handler = (req: any, reply: any) => Promise<any>;

/** Collect all registered route handlers by method + url pattern. */
const routeRegistry: Map<string, Handler> = new Map();

async function buildApp() {
  const pluginCtx: { handlers: Map<string, Handler> } = { handlers: routeRegistry };

  const fakeFastify = {
    addHook: vi.fn((_name: string, fn: any) => {
      pluginCtx.handlers.set('__preHandler__', fn);
    }),
    get: vi.fn((path: string, _opts: any, handler: Handler) =>
      pluginCtx.handlers.set(`GET:${path}`, handler)
    ),
    post: vi.fn((path: string, _opts: any, handler: Handler) =>
      pluginCtx.handlers.set(`POST:${path}`, handler)
    ),
    put: vi.fn((path: string, _opts: any, handler: Handler) =>
      pluginCtx.handlers.set(`PUT:${path}`, handler)
    ),
    delete: vi.fn((path: string, _opts: any, handler: Handler) =>
      pluginCtx.handlers.set(`DELETE:${path}`, handler)
    ),
    patch: vi.fn((path: string, _opts: any, handler: Handler) =>
      pluginCtx.handlers.set(`PATCH:${path}`, handler)
    ),
  };

  await storageRoutes(fakeFastify as any, {});
  await notificationRoutes(fakeFastify as any, {});
  await jobsRoutes(fakeFastify as any, {});
  await searchRoutes(fakeFastify as any, {});

  return pluginCtx.handlers;
}

function makeReply() {
  const reply: any = {
    _code: 200,
    _body: undefined,
    _headers: {} as Record<string, string>,
    code: vi.fn().mockImplementation(function (c: number) {
      reply._code = c;
      return reply;
    }),
    send: vi.fn().mockImplementation(function (b: any) {
      reply._body = b;
      return reply;
    }),
    header: vi.fn().mockImplementation(function (k: string, v: string) {
      reply._headers[k] = v;
      return reply;
    }),
    status: vi.fn().mockImplementation(function (c: number) {
      reply._code = c;
      return reply;
    }),
  };
  return reply;
}

// Proper v4 UUIDs for all tenant IDs (Zod v4 validates UUID format strictly)
const TENANT_E2E = 'a1b2c3d4-e5f6-4a7b-8c9d-e2e000000001';
const TENANT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TENANT_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const TENANT_D = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function makeReq(overrides: any = {}): Partial<FastifyRequest> {
  return {
    user: { id: 'user-e2e', tenantId: TENANT_E2E } as any,
    headers: { authorization: 'Bearer e2e-token' },
    params: {},
    query: {},
    body: {},
    log: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() } as any,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Core Services E2E Flows (T007-47)', () => {
  let handlers: Map<string, Handler>;

  beforeEach(async () => {
    vi.clearAllMocks();
    routeRegistry.clear();
    handlers = await buildApp();
  });

  // =========================================================================
  // Flow 1: File Upload → List → Signed URL → Delete
  // =========================================================================
  describe('Flow 1: File upload lifecycle', () => {
    it('uploads a file, lists it, gets a signed URL, then deletes it', async () => {
      const fileKey = 'uploads/1234-report.pdf';
      const fileInfo = {
        key: fileKey,
        bucket: 'tenant-tenant-e2e',
        size: 4096,
        contentType: 'application/pdf',
        uploadedAt: new Date().toISOString(),
        filename: 'report.pdf',
      };

      // Step 1: upload (storage route reads multipart — fake via mock returning fileInfo)
      mockUpload.mockResolvedValue(fileInfo);

      // The storage upload route reads request.file() — mock it on the request
      const uploadReq = makeReq({
        file: vi.fn().mockResolvedValue({
          filename: 'report.pdf',
          mimetype: 'application/pdf',
          file: (async function* () {
            yield Buffer.from('PDF content');
          })(),
        }),
        query: {},
      });
      const uploadReply = makeReply();
      const uploadHandler = handlers.get('POST:/storage/upload');
      expect(uploadHandler, 'POST:/storage/upload handler not found').toBeDefined();
      await uploadHandler!(uploadReq, uploadReply);
      expect(mockUpload).toHaveBeenCalledOnce();
      expect(uploadReply._code).toBe(201);
      expect(uploadReply._body).toMatchObject({ key: fileInfo.key });

      // Step 2: list files
      mockList.mockResolvedValue([fileInfo]);
      const listReq = makeReq({ query: {} });
      const listReply = makeReply();
      const listHandler = handlers.get('GET:/storage/list');
      expect(listHandler, 'GET:/storage/list handler not found').toBeDefined();
      await listHandler!(listReq, listReply);
      expect(mockList).toHaveBeenCalledOnce();
      expect(listReply._body.files).toHaveLength(1);
      expect(listReply._body.files[0].key).toBe(fileInfo.key);

      // Step 3: get signed URL (route: GET /storage/signed-url/*)
      mockGetSignedUrl.mockResolvedValue('https://signed.url/report.pdf?token=xyz');
      const signReq = makeReq({
        params: { '*': 'uploads/report.pdf' },
        query: { expiresIn: '3600' },
      });
      const signReply = makeReply();
      const signHandler = handlers.get('GET:/storage/signed-url/*');
      expect(signHandler, 'GET:/storage/signed-url/* handler not found').toBeDefined();
      await signHandler!(signReq, signReply);
      expect(mockGetSignedUrl).toHaveBeenCalledOnce();
      expect(signReply._body).toMatchObject({ url: expect.stringContaining('signed.url') });

      // Step 4: delete (route: DELETE /storage/*)
      mockStorageDelete.mockResolvedValue(undefined);
      const delReq = makeReq({ params: { '*': 'uploads/report.pdf' } });
      const delReply = makeReply();
      const delHandler = handlers.get('DELETE:/storage/*');
      expect(delHandler, 'DELETE:/storage/* handler not found').toBeDefined();
      await delHandler!(delReq, delReply);
      expect(mockStorageDelete).toHaveBeenCalledOnce();
      expect(delReply._code).toBe(204);
    });

    it('returns 413 when upload fails with FILE_TOO_LARGE', async () => {
      const err: any = new Error('File exceeds maximum size');
      err.code = StorageErrorCode.FILE_TOO_LARGE;
      err.statusCode = 413;
      mockUpload.mockRejectedValue(err);

      const req = makeReq({
        file: vi.fn().mockResolvedValue({
          filename: 'huge.bin',
          mimetype: 'application/octet-stream',
          file: (async function* () {
            yield Buffer.from('large content');
          })(),
        }),
        query: {},
      });
      const reply = makeReply();
      const handler = handlers.get('POST:/storage/upload');
      await handler!(req, reply);
      expect(reply._code).toBe(413);
      expect(reply._body?.error?.code).toBe(StorageErrorCode.FILE_TOO_LARGE);
    });
  });

  // =========================================================================
  // Flow 2: Notification send → list → mark all read
  // =========================================================================
  describe('Flow 2: Notification send and inbox management', () => {
    it('sends a notification, lists inbox, and marks all as read', async () => {
      const notif = {
        id: 'b1c2d3e4-f5a6-4b7c-8d9e-000000000001',
        tenantId: TENANT_E2E,
        userId: 'user-e2e',
        channel: 'IN_APP',
        title: 'Welcome to Plexica',
        body: 'Your account is ready.',
        status: 'PENDING',
        createdAt: new Date().toISOString(),
      };

      // Step 1: send in-app notification
      // Route: POST /notifications (validates with NotificationSchema)
      mockSend.mockResolvedValue(notif);
      const sendReq = makeReq({
        body: {
          userId: 'user-e2e',
          channel: 'IN_APP',
          title: 'Welcome to Plexica',
          body: 'Your account is ready.',
        },
      });
      const sendReply = makeReply();
      const sendHandler = handlers.get('POST:/notifications');
      expect(sendHandler, 'POST:/notifications handler not found').toBeDefined();
      await sendHandler!(sendReq, sendReply);
      expect(mockSend).toHaveBeenCalledOnce();
      expect(sendReply._code).toBe(201);

      // Step 2: list inbox (GET /notifications)
      mockListForUser.mockResolvedValue([notif]);
      mockGetUnreadCount.mockResolvedValue(1);
      const listReq = makeReq({ query: {} });
      const listReply = makeReply();
      const listHandler = handlers.get('GET:/notifications');
      expect(listHandler, 'GET:/notifications handler not found').toBeDefined();
      await listHandler!(listReq, listReply);
      expect(listReply._body.notifications).toHaveLength(1);
      expect(listReply._body.unreadCount).toBe(1);

      // Step 3: mark all read (POST /notifications/mark-all-read)
      mockMarkAllAsRead.mockResolvedValue(1);
      const markReq = makeReq({});
      const markReply = makeReply();
      const markHandler = handlers.get('POST:/notifications/mark-all-read');
      expect(markHandler, 'POST:/notifications/mark-all-read handler not found').toBeDefined();
      await markHandler!(markReq, markReply);
      expect(mockMarkAllAsRead).toHaveBeenCalledWith(TENANT_E2E, 'user-e2e');
      expect(markReply._code).toBe(200);
    });

    it('bulk-sends to multiple recipients and enqueues them', async () => {
      mockSendBulk.mockResolvedValue(undefined);
      // Route POST /notifications/bulk expects an array body
      const req = makeReq({
        body: [
          { userId: 'u1', channel: 'IN_APP', title: 'System maintenance', body: 'Offline 2-3 AM.' },
          { userId: 'u2', channel: 'IN_APP', title: 'System maintenance', body: 'Offline 2-3 AM.' },
          { userId: 'u3', channel: 'IN_APP', title: 'System maintenance', body: 'Offline 2-3 AM.' },
        ],
      });
      const reply = makeReply();
      const handler = handlers.get('POST:/notifications/bulk');
      expect(handler, 'POST:/notifications/bulk handler not found').toBeDefined();
      await handler!(req, reply);
      expect(mockSendBulk).toHaveBeenCalledOnce();
      expect(reply._code).toBe(202);
      expect(reply._body).toMatchObject({ count: 3 });
    });

    it('returns 400 when notification send fails with INVALID_EMAIL', async () => {
      const err: any = new Error('Invalid email address');
      err.code = NotificationErrorCode.INVALID_EMAIL;
      err.statusCode = 400;
      mockSend.mockRejectedValue(err);

      const req = makeReq({
        body: { userId: 'user-e2e', channel: 'IN_APP', title: 'x', body: 'x' },
      });
      const reply = makeReply();
      const handler = handlers.get('POST:/notifications');
      await handler!(req, reply);
      expect(reply._code).toBe(400);
      expect(reply._body?.error?.code).toBe(NotificationErrorCode.INVALID_EMAIL);
    });
  });

  // =========================================================================
  // Flow 3: Job enqueue → check status → cancel
  // =========================================================================
  describe('Flow 3: Job queue lifecycle', () => {
    it('enqueues a job, checks its status, then cancels it', async () => {
      const jobId = 'job-e2e-abc123';

      // Step 1: enqueue (POST /jobs)
      mockEnqueue.mockResolvedValue({ jobId, status: 'QUEUED' });
      const enqueueReq = makeReq({
        body: { name: 'send-report', payload: { reportId: 'rep-1' } },
      });
      const enqueueReply = makeReply();
      const enqueueHandler = handlers.get('POST:/jobs');
      expect(enqueueHandler, 'POST:/jobs handler not found').toBeDefined();
      await enqueueHandler!(enqueueReq, enqueueReply);
      expect(mockEnqueue).toHaveBeenCalledOnce();
      expect(enqueueReply._code).toBe(201);
      expect(enqueueReply._body.jobId).toBe(jobId);

      // Step 2: check status (GET /jobs/:id/status)
      mockGetStatus.mockResolvedValue({ jobId, status: 'RUNNING', retries: 0 });
      const statusReq = makeReq({ params: { id: jobId } });
      const statusReply = makeReply();
      const statusHandler = handlers.get('GET:/jobs/:id/status');
      expect(statusHandler, 'GET:/jobs/:id/status handler not found').toBeDefined();
      await statusHandler!(statusReq, statusReply);
      expect(mockGetStatus).toHaveBeenCalledWith(jobId, TENANT_E2E);
      expect(statusReply._body.status).toBe('RUNNING');

      // Step 3: cancel (DELETE /jobs/:id — returns 204)
      mockCancel.mockResolvedValue(undefined);
      const cancelReq = makeReq({ params: { id: jobId } });
      const cancelReply = makeReply();
      const cancelHandler = handlers.get('DELETE:/jobs/:id');
      expect(cancelHandler, 'DELETE:/jobs/:id handler not found').toBeDefined();
      await cancelHandler!(cancelReq, cancelReply);
      expect(mockCancel).toHaveBeenCalledWith(jobId, TENANT_E2E);
      expect(cancelReply._code).toBe(204);
    });

    it('schedules a recurring job and lists all jobs', async () => {
      // Step 1: schedule (POST /jobs/schedule)
      mockSchedule.mockResolvedValue({ jobId: 'job-cron-1', status: 'SCHEDULED' });
      const schedReq = makeReq({
        body: {
          name: 'daily-digest',
          payload: {},
          cronExpression: '0 9 * * *',
        },
      });
      const schedReply = makeReply();
      const schedHandler = handlers.get('POST:/jobs/schedule');
      expect(schedHandler, 'POST:/jobs/schedule handler not found').toBeDefined();
      await schedHandler!(schedReq, schedReply);
      expect(mockSchedule).toHaveBeenCalledOnce();
      expect(schedReply._code).toBe(201);
      expect(schedReply._body.status).toBe('SCHEDULED');

      // Step 2: list jobs (GET /jobs)
      mockRepoList.mockResolvedValue({
        jobs: [
          { id: 'job-cron-1', name: 'daily-digest', status: 'SCHEDULED', tenantId: TENANT_E2E },
        ],
        total: 1,
      });
      const listReq = makeReq({ query: {} });
      const listReply = makeReply();
      const listHandler = handlers.get('GET:/jobs');
      expect(listHandler, 'GET:/jobs handler not found').toBeDefined();
      await listHandler!(listReq, listReply);
      expect(mockRepoList).toHaveBeenCalledOnce();
      expect(listReply._body.jobs).toHaveLength(1);
      expect(listReply._body.jobs[0].name).toBe('daily-digest');
    });

    it('returns 404 when cancelling a non-existent job', async () => {
      const err: any = new Error('Job not found');
      err.code = JobErrorCode.JOB_NOT_FOUND;
      err.statusCode = 404;
      mockCancel.mockRejectedValue(err);

      const req = makeReq({ params: { id: 'ghost-job' } });
      const reply = makeReply();
      const handler = handlers.get('DELETE:/jobs/:id');
      await handler!(req, reply);
      expect(reply._code).toBe(404);
      expect(reply._body?.error?.code).toBe(JobErrorCode.JOB_NOT_FOUND);
    });
  });

  // =========================================================================
  // Flow 4: Search index → search → reindex → delete
  // =========================================================================
  describe('Flow 4: Search document lifecycle', () => {
    it('indexes a document, searches for it, reindexes, then deletes it', async () => {
      const docId = 'doc-e2e-001';

      // Step 1: index a document (POST /search/index)
      // IndexableSchema requires: documentId, type, title, body
      mockIndex.mockResolvedValue(undefined);
      const indexReq = makeReq({
        body: {
          documentId: docId,
          type: 'workspace',
          title: 'Project Alpha',
          body: 'A project about alpha testing the search feature',
          metadata: { workspaceId: 'ws-1' },
        },
      });
      const indexReply = makeReply();
      const indexHandler = handlers.get('POST:/search/index');
      expect(indexHandler, 'POST:/search/index handler not found').toBeDefined();
      await indexHandler!(indexReq, indexReply);
      expect(mockIndex).toHaveBeenCalledOnce();
      expect(indexReply._code).toBe(201);

      // Step 2: search (POST /search — body-based)
      mockSearch.mockResolvedValue([
        {
          documentId: docId,
          type: 'workspace',
          title: 'Project Alpha',
          snippet: '…alpha testing the search feature…',
          rank: 0.95,
        },
      ]);
      const searchReq = makeReq({ body: { q: 'alpha', type: 'workspace' } });
      const searchReply = makeReply();
      const searchHandler = handlers.get('POST:/search');
      expect(searchHandler, 'POST:/search handler not found').toBeDefined();
      await searchHandler!(searchReq, searchReply);
      expect(mockSearch).toHaveBeenCalledOnce();
      expect(searchReply._body.results).toHaveLength(1);
      expect(searchReply._body.results[0].documentId).toBe(docId);
      expect(searchReply._body.count).toBe(1);

      // Step 3: reindex (POST /search/reindex — 202 Accepted)
      mockReindex.mockResolvedValue({ jobId: 'reindex-job-1' });
      const reindexReq = makeReq({ body: { type: 'workspace' } });
      const reindexReply = makeReply();
      const reindexHandler = handlers.get('POST:/search/reindex');
      expect(reindexHandler, 'POST:/search/reindex handler not found').toBeDefined();
      await reindexHandler!(reindexReq, reindexReply);
      expect(mockReindex).toHaveBeenCalledOnce();
      expect(reindexReply._code).toBe(202);

      // Step 4: delete from index (DELETE /search/:documentId?type=workspace)
      mockSearchDelete.mockResolvedValue(undefined);
      const deleteReq = makeReq({
        params: { documentId: docId },
        query: { type: 'workspace' },
      });
      const deleteReply = makeReply();
      const deleteHandler = handlers.get('DELETE:/search/:documentId');
      expect(deleteHandler, 'DELETE:/search/:documentId handler not found').toBeDefined();
      await deleteHandler!(deleteReq, deleteReply);
      expect(mockSearchDelete).toHaveBeenCalledWith(TENANT_E2E, docId, 'workspace');
      expect(deleteReply._code).toBe(204);
    });

    it('returns empty results for a query with no matches', async () => {
      mockSearch.mockResolvedValue([]);
      const req = makeReq({ body: { q: 'zzznomatch' } });
      const reply = makeReply();
      const handler = handlers.get('POST:/search');
      await handler!(req, reply);
      expect(reply._body.results).toHaveLength(0);
      expect(reply._body.count).toBe(0);
    });

    it('returns 400 when deleting a document without required type param', async () => {
      // DELETE /search/:documentId requires ?type query param
      const req = makeReq({
        params: { documentId: 'ghost-doc' },
        query: {}, // missing 'type'
      });
      const reply = makeReply();
      const handler = handlers.get('DELETE:/search/:documentId');
      await handler!(req, reply);
      expect(reply._code).toBe(400);
      expect(reply._body?.error?.code).toBe('VALIDATION_ERROR');
    });
  });

  // =========================================================================
  // Flow 5: Cross-service — upload triggers notification + job
  // =========================================================================
  describe('Flow 5: Cross-service orchestration', () => {
    it('upload completion triggers notification + job enqueue (orchestrated by caller)', async () => {
      // Simulate: upload a file, then send a notification, then enqueue a processing job.
      const fileInfo = {
        key: 'uploads/1234-dataset.csv',
        bucket: 'tenant-tenant-e2e',
        size: 102400,
        contentType: 'text/csv',
        uploadedAt: new Date().toISOString(),
        filename: 'dataset.csv',
      };

      // 1. Upload file
      mockUpload.mockResolvedValue(fileInfo);
      const uploadReply = makeReply();
      await handlers.get('POST:/storage/upload')!(
        makeReq({
          file: vi.fn().mockResolvedValue({
            filename: 'dataset.csv',
            mimetype: 'text/csv',
            file: (async function* () {
              yield Buffer.from('csv data');
            })(),
          }),
          query: {},
        }),
        uploadReply
      );
      expect(uploadReply._code).toBe(201);
      const uploadedKey = uploadReply._body.key;
      expect(uploadedKey).toBe(fileInfo.key);

      // 2. Notify user about upload completion
      mockSend.mockResolvedValue({ id: 'notif-upload-done', status: 'PENDING' });
      const notifReply = makeReply();
      await handlers.get('POST:/notifications')!(
        makeReq({
          body: {
            userId: 'user-e2e',
            channel: 'IN_APP',
            title: 'Upload complete',
            body: `Your file ${uploadedKey} is ready.`,
          },
        }),
        notifReply
      );
      expect(notifReply._code).toBe(201);

      // 3. Enqueue a processing job for the uploaded file
      mockEnqueue.mockResolvedValue({ jobId: 'job-process-csv', status: 'QUEUED' });
      const jobReply = makeReply();
      await handlers.get('POST:/jobs')!(
        makeReq({
          body: {
            name: 'process-csv',
            payload: { fileKey: uploadedKey },
          },
        }),
        jobReply
      );
      expect(jobReply._code).toBe(201);
      expect(jobReply._body.status).toBe('QUEUED');

      // All three steps succeeded independently — cross-service orchestration works
      expect(mockUpload).toHaveBeenCalledOnce();
      expect(mockSend).toHaveBeenCalledOnce();
      expect(mockEnqueue).toHaveBeenCalledOnce();
    });

    it('search indexes a document after job completes (job → index flow)', async () => {
      // Simulate: job completes → caller indexes the result in search

      // 1. Enqueue analysis job (POST /jobs)
      mockEnqueue.mockResolvedValue({ jobId: 'job-analyze-1', status: 'QUEUED' });
      const jobReply = makeReply();
      await handlers.get('POST:/jobs')!(
        makeReq({ body: { name: 'analyze-content', payload: { contentId: 'c-1' } } }),
        jobReply
      );
      expect(jobReply._code).toBe(201);

      // 2. Check job status (GET /jobs/:id/status → COMPLETED)
      mockGetStatus.mockResolvedValue({ jobId: 'job-analyze-1', status: 'COMPLETED', retries: 0 });
      const statusReply = makeReply();
      await handlers.get('GET:/jobs/:id/status')!(
        makeReq({ params: { id: 'job-analyze-1' } }),
        statusReply
      );
      expect(statusReply._body.status).toBe('COMPLETED');

      // 3. Index the analyzed content into search (POST /search/index)
      mockIndex.mockResolvedValue(undefined);
      const indexReply = makeReply();
      await handlers.get('POST:/search/index')!(
        makeReq({
          body: {
            documentId: 'content-c-1',
            type: 'content',
            title: 'Analyzed Content',
            body: 'This content has been processed.',
          },
        }),
        indexReply
      );
      expect(indexReply._code).toBe(201);

      expect(mockEnqueue).toHaveBeenCalledOnce();
      expect(mockGetStatus).toHaveBeenCalledOnce();
      expect(mockIndex).toHaveBeenCalledOnce();
    });
  });

  // =========================================================================
  // Flow 6: Tenant isolation — requests from different tenants are scoped
  // =========================================================================
  describe('Flow 6: Tenant isolation across services', () => {
    it('StorageService is constructed with the requesting tenant ID', async () => {
      const { StorageService } = await import('../../modules/storage/storage.service.js');
      const MockStorageService = StorageService as unknown as ReturnType<typeof vi.fn>;

      mockUpload.mockResolvedValue({
        key: 'uploads/file.txt',
        bucket: `tenant-${TENANT_A}`,
        size: 100,
        contentType: 'text/plain',
        uploadedAt: new Date().toISOString(),
        filename: 'file.txt',
      });

      const tenantAReq = makeReq({
        user: { id: 'user-a', tenantId: TENANT_A } as any,
        file: vi.fn().mockResolvedValue({
          filename: 'file.txt',
          mimetype: 'text/plain',
          file: (async function* () {
            yield Buffer.from('abc');
          })(),
        }),
        query: {},
      });
      const reply = makeReply();
      await handlers.get('POST:/storage/upload')!(tenantAReq, reply);

      // StorageService constructor must have been called with TENANT_A
      expect(MockStorageService).toHaveBeenCalledWith(TENANT_A);
    });

    it('search results are scoped to requesting tenant', async () => {
      mockSearch.mockResolvedValue([]);
      const tenantBReq = makeReq({
        user: { id: 'user-b', tenantId: TENANT_B } as any,
        body: { q: 'test' },
      });
      const reply = makeReply();
      await handlers.get('POST:/search')!(tenantBReq, reply);

      const callArgs = mockSearch.mock.calls[0];
      expect(callArgs[0]).toBe(TENANT_B);
    });

    it('job enqueue uses requesting tenant context', async () => {
      mockEnqueue.mockResolvedValue({ jobId: 'j-1', status: 'QUEUED' });
      const req = makeReq({
        user: { id: 'user-c', tenantId: TENANT_C } as any,
        body: { name: 'my-job', payload: {} },
      });
      const reply = makeReply();
      await handlers.get('POST:/jobs')!(req, reply);

      // The job passed to enqueue must have tenantId = TENANT_C
      const callArgs = mockEnqueue.mock.calls[0];
      expect(callArgs[0]).toMatchObject({ tenantId: TENANT_C });
    });

    it('notifications are sent in requesting tenant context', async () => {
      mockSend.mockResolvedValue({ id: 'n-1' });
      const req = makeReq({
        user: { id: 'user-d', tenantId: TENANT_D } as any,
        body: { userId: 'user-d', channel: 'IN_APP', title: 'Hi', body: 'Hello' },
      });
      const reply = makeReply();
      await handlers.get('POST:/notifications')!(req, reply);

      // The notification passed to send must include tenantId = TENANT_D
      const callArgs = mockSend.mock.calls[0];
      expect(callArgs[0]).toMatchObject({ tenantId: TENANT_D });
    });
  });
});
