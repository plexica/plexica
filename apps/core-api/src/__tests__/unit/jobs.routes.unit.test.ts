// apps/core-api/src/__tests__/unit/jobs.routes.unit.test.ts
// T007-42 — Unit tests for Job Queue API routes (fake-server pattern, no real DB)

import 'dotenv/config';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FastifyRequest } from 'fastify';
import { JobQueueService } from '../../modules/jobs/job-queue.service.js';
import { JobRepository } from '../../modules/jobs/job.repository.js';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockEnqueue, mockSchedule, mockGetStatus, mockCancel, mockRepoList, mockRepoFindById } =
  vi.hoisted(() => ({
    mockEnqueue: vi.fn(),
    mockSchedule: vi.fn(),
    mockGetStatus: vi.fn(),
    mockCancel: vi.fn(),
    mockRepoList: vi.fn(),
    mockRepoFindById: vi.fn(),
  }));

// Must mock redis + bullmq before jobs.routes.ts is imported (module-level imports)
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

// ---------------------------------------------------------------------------
// Import route under test (after mocks)
// ---------------------------------------------------------------------------

import { jobsRoutes } from '../../modules/jobs/jobs.routes.js';
import { JobErrorCode, JobStatus } from '../../types/core-services.types.js';

// Cast to vi.fn() to re-apply mock implementation in beforeEach
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
    patch: (path: string, _opts: any, handler: Handler) => {
      if (!routes.has('PATCH')) routes.set('PATCH', new Map());
      routes.get('PATCH')!.set(path, handler);
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

// Zod v4 strict UUID v4: 3rd group must start with 4, 4th group must start with 8/9/a/b
const TENANT_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-000000000001';
const USER_ID = 'user-jobs-1';
const JOB_ID = 'job-uuid-0001';

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

describe('Job Queue API Routes', () => {
  let fakeServer: ReturnType<typeof buildFakeServer>;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Re-apply constructor mocks after vi.clearAllMocks()
    MockJobQueueService.mockImplementation(function (this: any) {
      this.enqueue = mockEnqueue;
      this.schedule = mockSchedule;
      this.getStatus = mockGetStatus;
      this.cancel = mockCancel;
    });

    MockJobRepository.mockImplementation(function (this: any) {
      this.list = mockRepoList;
      this.findById = mockRepoFindById;
      this.create = vi.fn();
      this.updateStatus = vi.fn();
    });

    // Safe defaults
    mockEnqueue.mockResolvedValue({ id: JOB_ID, status: JobStatus.QUEUED });
    mockSchedule.mockResolvedValue({ id: JOB_ID, status: JobStatus.SCHEDULED });
    mockGetStatus.mockResolvedValue({ id: JOB_ID, status: JobStatus.QUEUED });
    mockCancel.mockResolvedValue(undefined);
    mockRepoList.mockResolvedValue({ jobs: [], total: 0 });
    mockRepoFindById.mockResolvedValue(null);

    fakeServer = buildFakeServer();
    await jobsRoutes(fakeServer.server, {} as any);
  });

  // -------------------------------------------------------------------------
  // Auth enforcement
  // -------------------------------------------------------------------------
  describe('Auth enforcement', () => {
    it('should register authMiddleware as a preHandler hook', () => {
      expect(fakeServer.server.addHook).toHaveBeenCalledWith('preHandler', expect.any(Function));
    });

    it('should throw when tenant context is missing from request', async () => {
      const handler = fakeServer.getHandler('POST', '/jobs');
      const req = makeRequest({ user: {} });
      const reply = makeReply();

      await expect(handler(req, reply)).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // POST /jobs
  // -------------------------------------------------------------------------
  describe('POST /jobs', () => {
    it('should return 400 when body is invalid (missing name)', async () => {
      const handler = fakeServer.getHandler('POST', '/jobs');
      const req = makeRequest({ body: { payload: { foo: 'bar' } } }); // missing name
      const reply = makeReply();

      await handler(req, reply);

      expect(reply.code).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.objectContaining({ code: 'VALIDATION_ERROR' }) })
      );
    });

    it('should enqueue a job and return 201', async () => {
      const jobResult = { id: JOB_ID, status: JobStatus.QUEUED, name: 'send-email' };
      mockEnqueue.mockResolvedValue(jobResult);

      const handler = fakeServer.getHandler('POST', '/jobs');
      const req = makeRequest({ body: { name: 'send-email', payload: { foo: 'bar' } } });
      const reply = makeReply();

      await handler(req, reply);

      expect(mockEnqueue).toHaveBeenCalled();
      expect(reply.code).toHaveBeenCalledWith(201);
      expect(reply.send).toHaveBeenCalledWith(jobResult);
    });

    it('should return 500 on enqueue failure', async () => {
      mockEnqueue.mockRejectedValue(new Error('Redis down'));

      const handler = fakeServer.getHandler('POST', '/jobs');
      const req = makeRequest({ body: { name: 'failing-job', payload: { foo: 'bar' } } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply.code).toHaveBeenCalledWith(500);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({ code: JobErrorCode.ENQUEUE_FAILED }),
        })
      );
    });
  });

  // -------------------------------------------------------------------------
  // POST /jobs/schedule
  // -------------------------------------------------------------------------
  describe('POST /jobs/schedule', () => {
    it('should return 400 when cronExpression is missing', async () => {
      const handler = fakeServer.getHandler('POST', '/jobs/schedule');
      const req = makeRequest({ body: { name: 'cron-job', payload: {} } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply.code).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({ code: JobErrorCode.INVALID_CRON }),
        })
      );
    });

    it('should schedule a cron job and return 201', async () => {
      const schedResult = { id: JOB_ID, status: JobStatus.SCHEDULED };
      mockSchedule.mockResolvedValue(schedResult);

      const handler = fakeServer.getHandler('POST', '/jobs/schedule');
      const req = makeRequest({
        body: { name: 'daily-cleanup', payload: { foo: 'bar' }, cronExpression: '0 9 * * *' },
      });
      const reply = makeReply();

      await handler(req, reply);

      expect(mockSchedule).toHaveBeenCalled();
      expect(reply.code).toHaveBeenCalledWith(201);
      expect(reply.send).toHaveBeenCalledWith(schedResult);
    });

    it('should return 400 when service throws INVALID_CRON', async () => {
      mockSchedule.mockRejectedValue(
        Object.assign(new Error('Invalid cron'), { code: JobErrorCode.INVALID_CRON })
      );

      const handler = fakeServer.getHandler('POST', '/jobs/schedule');
      const req = makeRequest({
        body: {
          name: 'bad-cron',
          payload: { foo: 'bar' },
          cronExpression: 'not-a-cron',
        },
      });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply.code).toHaveBeenCalledWith(400);
    });
  });

  // -------------------------------------------------------------------------
  // GET /jobs/:id/status
  // -------------------------------------------------------------------------
  describe('GET /jobs/:id/status', () => {
    it('should return job status', async () => {
      const statusResult = { id: JOB_ID, status: JobStatus.RUNNING, progress: 50 };
      mockGetStatus.mockResolvedValue(statusResult);

      const handler = fakeServer.getHandler('GET', '/jobs/:id/status');
      const req = makeRequest({ params: { id: JOB_ID } });
      const reply = makeReply();

      await handler(req, reply);

      expect(mockGetStatus).toHaveBeenCalledWith(JOB_ID, TENANT_ID);
      expect(reply.send).toHaveBeenCalledWith(statusResult);
    });

    it('should return 404 when job is not found', async () => {
      mockGetStatus.mockRejectedValue(
        Object.assign(new Error(`Job ${JOB_ID} not found`), { code: JobErrorCode.JOB_NOT_FOUND })
      );

      const handler = fakeServer.getHandler('GET', '/jobs/:id/status');
      const req = makeRequest({ params: { id: JOB_ID } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply.code).toHaveBeenCalledWith(404);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({ code: JobErrorCode.JOB_NOT_FOUND }),
        })
      );
    });
  });

  // -------------------------------------------------------------------------
  // DELETE /jobs/:id
  // -------------------------------------------------------------------------
  describe('DELETE /jobs/:id', () => {
    it('should cancel a job and return 204', async () => {
      mockCancel.mockResolvedValue(undefined);

      const handler = fakeServer.getHandler('DELETE', '/jobs/:id');
      const req = makeRequest({ params: { id: JOB_ID } });
      const reply = makeReply();

      await handler(req, reply);

      expect(mockCancel).toHaveBeenCalledWith(JOB_ID, TENANT_ID);
      expect(reply.code).toHaveBeenCalledWith(204);
    });

    it('should return 404 when job is not found', async () => {
      mockCancel.mockRejectedValue(
        Object.assign(new Error('Job not found'), { code: JobErrorCode.JOB_NOT_FOUND })
      );

      const handler = fakeServer.getHandler('DELETE', '/jobs/:id');
      const req = makeRequest({ params: { id: JOB_ID } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply.code).toHaveBeenCalledWith(404);
    });

    it('should return 409 when job is already cancelled', async () => {
      mockCancel.mockRejectedValue(
        Object.assign(new Error('Already cancelled'), { code: JobErrorCode.ALREADY_CANCELLED })
      );

      const handler = fakeServer.getHandler('DELETE', '/jobs/:id');
      const req = makeRequest({ params: { id: JOB_ID } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply.code).toHaveBeenCalledWith(409);
    });
  });

  // -------------------------------------------------------------------------
  // GET /jobs
  // -------------------------------------------------------------------------
  describe('GET /jobs', () => {
    it('should list jobs with pagination', async () => {
      const jobsList = [
        { id: 'j1', name: 'task-a' },
        { id: 'j2', name: 'task-b' },
      ];
      mockRepoList.mockResolvedValue({ jobs: jobsList, total: 2 });

      const handler = fakeServer.getHandler('GET', '/jobs');
      const req = makeRequest({ query: { page: '1', limit: '10' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(mockRepoList).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ page: 1, limit: 10 })
      );
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ jobs: jobsList, total: 2, pages: 1 })
      );
    });

    it('should filter by status when query.status provided', async () => {
      mockRepoList.mockResolvedValue({ jobs: [], total: 0 });

      const handler = fakeServer.getHandler('GET', '/jobs');
      const req = makeRequest({ query: { status: 'FAILED' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(mockRepoList).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ status: 'FAILED' })
      );
    });
  });

  // -------------------------------------------------------------------------
  // POST /jobs/:id/retry
  // -------------------------------------------------------------------------
  describe('POST /jobs/:id/retry', () => {
    it('should return 404 when job does not exist', async () => {
      mockRepoFindById.mockResolvedValue(null);

      const handler = fakeServer.getHandler('POST', '/jobs/:id/retry');
      const req = makeRequest({ params: { id: 'missing-job' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply.code).toHaveBeenCalledWith(404);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({ code: JobErrorCode.JOB_NOT_FOUND }),
        })
      );
    });

    it('should return 422 when job is not in FAILED status', async () => {
      mockRepoFindById.mockResolvedValue({
        id: JOB_ID,
        status: JobStatus.QUEUED,
        name: 'my-job',
        payload: { tenantId: TENANT_ID },
        maxRetries: 3,
      });

      const handler = fakeServer.getHandler('POST', '/jobs/:id/retry');
      const req = makeRequest({ params: { id: JOB_ID } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply.code).toHaveBeenCalledWith(422);
    });

    it('should re-enqueue a failed job and return 201', async () => {
      mockRepoFindById.mockResolvedValue({
        id: JOB_ID,
        status: JobStatus.FAILED,
        name: 'retry-job',
        pluginId: null,
        payload: { tenantId: TENANT_ID, data: 'x' },
        maxRetries: 3,
      });
      const retryResult = { id: 'new-job-id', status: JobStatus.QUEUED };
      mockEnqueue.mockResolvedValue(retryResult);

      const handler = fakeServer.getHandler('POST', '/jobs/:id/retry');
      const req = makeRequest({ params: { id: JOB_ID } });
      const reply = makeReply();

      await handler(req, reply);

      expect(mockEnqueue).toHaveBeenCalled();
      expect(reply.code).toHaveBeenCalledWith(201);
      expect(reply.send).toHaveBeenCalledWith(retryResult);
    });
  });

  // -------------------------------------------------------------------------
  // PATCH /jobs/:id/schedule/disable
  // -------------------------------------------------------------------------
  describe('PATCH /jobs/:id/schedule/disable', () => {
    it('should return 404 when job does not exist', async () => {
      mockRepoFindById.mockResolvedValue(null);

      const handler = fakeServer.getHandler('PATCH', '/jobs/:id/schedule/disable');
      const req = makeRequest({ params: { id: 'ghost-job' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply.code).toHaveBeenCalledWith(404);
    });

    it('should return 422 when job is not SCHEDULED', async () => {
      mockRepoFindById.mockResolvedValue({
        id: JOB_ID,
        status: JobStatus.COMPLETED,
        name: 'done-job',
        payload: { tenantId: TENANT_ID },
        maxRetries: 0,
      });

      const handler = fakeServer.getHandler('PATCH', '/jobs/:id/schedule/disable');
      const req = makeRequest({ params: { id: JOB_ID } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply.code).toHaveBeenCalledWith(422);
    });

    it('should disable a scheduled job and return success', async () => {
      mockRepoFindById.mockResolvedValue({
        id: JOB_ID,
        status: JobStatus.SCHEDULED,
        name: 'cron-job',
        payload: { tenantId: TENANT_ID },
        maxRetries: 0,
      });
      mockCancel.mockResolvedValue(undefined);

      const handler = fakeServer.getHandler('PATCH', '/jobs/:id/schedule/disable');
      const req = makeRequest({ params: { id: JOB_ID } });
      const reply = makeReply();

      await handler(req, reply);

      expect(mockCancel).toHaveBeenCalledWith(JOB_ID, TENANT_ID);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Schedule disabled', jobId: JOB_ID })
      );
    });
  });
});
