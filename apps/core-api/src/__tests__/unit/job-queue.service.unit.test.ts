// apps/core-api/src/__tests__/unit/job-queue.service.unit.test.ts
// T007-38 — Unit tests for JobQueueService
// Tests: enqueue (success, missing tenantId), schedule (invalid cron, valid cron),
//        cancel (not found, already cancelled, success), getStatus

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoist all mock variables so they are accessible inside vi.mock() factories
// ---------------------------------------------------------------------------

const {
  mockQueueAdd,
  mockQueueUpsertJobScheduler,
  mockQueueRemoveJobScheduler,
  mockQueueGetJob,
  mockQueueClose,
  mockRepoCreate,
  mockRepoUpdateStatus,
  mockRepoFindById,
} = vi.hoisted(() => ({
  mockQueueAdd: vi.fn(),
  mockQueueUpsertJobScheduler: vi.fn(),
  mockQueueRemoveJobScheduler: vi.fn(),
  mockQueueGetJob: vi.fn(),
  mockQueueClose: vi.fn(),
  mockRepoCreate: vi.fn(),
  mockRepoUpdateStatus: vi.fn(),
  mockRepoFindById: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock heavy dependencies BEFORE importing the SUT so that the module-level
// `new Queue(...)` in the constructor uses mocked BullMQ.
// ---------------------------------------------------------------------------

// Mock ioredis so that `import { redis } from '../../lib/redis.js'` never
// tries to open a real TCP connection.
vi.mock('../../lib/redis.js', () => ({
  redis: { options: {} },
  default: { options: {} },
}));

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(function (this: any) {
    this.add = mockQueueAdd;
    this.upsertJobScheduler = mockQueueUpsertJobScheduler;
    this.removeJobScheduler = mockQueueRemoveJobScheduler;
    this.getJob = mockQueueGetJob;
    this.close = mockQueueClose;
  }),
  Worker: vi.fn(),
}));

// cron-parser: do NOT mock at module level — let the real library validate expressions.
// The "invalid cron" test passes an expression the real library will reject.
// The "valid cron" test passes '0 9 * * *' which the real library accepts.

vi.mock('../../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../modules/jobs/job.repository.js', () => ({
  JobRepository: vi.fn().mockImplementation(function (this: any) {
    this.create = mockRepoCreate;
    this.updateStatus = mockRepoUpdateStatus;
    this.findById = mockRepoFindById;
  }),
}));

import { JobQueueService } from '../../modules/jobs/job-queue.service.js';
import { JobRepository } from '../../modules/jobs/job.repository.js';
import { JobStatus, JobErrorCode } from '../../types/core-services.types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TENANT_ID = 'tenant-jqs';

function makeRepo(): JobRepository {
  return new JobRepository() as any;
}

function makeSvc(repo: JobRepository): JobQueueService {
  return new JobQueueService(repo);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('JobQueueService', () => {
  let repo: JobRepository;
  let svc: JobQueueService;

  beforeEach(() => {
    // Clear call history on all mocks (does NOT reset implementations per Vitest docs)
    mockQueueAdd.mockReset();
    mockQueueUpsertJobScheduler.mockReset();
    mockQueueRemoveJobScheduler.mockReset();
    mockQueueGetJob.mockReset();
    mockQueueClose.mockReset();
    mockRepoCreate.mockReset();
    mockRepoUpdateStatus.mockReset();
    mockRepoFindById.mockReset();
    repo = makeRepo();
    svc = makeSvc(repo);
  });

  // -------------------------------------------------------------------------
  // enqueue()
  // -------------------------------------------------------------------------
  describe('enqueue()', () => {
    it('should throw ENQUEUE_FAILED when tenantId is missing', async () => {
      await expect(
        svc.enqueue({ name: 'test.job', payload: {}, tenantId: '' } as any)
      ).rejects.toMatchObject({ code: JobErrorCode.ENQUEUE_FAILED, statusCode: 400 });
    });

    it('should create a DB record, add to queue, then update status to QUEUED', async () => {
      const dbJob = { id: 'job-001', status: JobStatus.PENDING, retries: 0 };
      mockRepoCreate.mockResolvedValue(dbJob);
      mockRepoUpdateStatus.mockResolvedValue(undefined);
      mockQueueAdd.mockResolvedValue({ id: 'bull-001' });

      const result = await svc.enqueue({
        tenantId: TENANT_ID,
        name: 'email.send',
        payload: { tenantId: TENANT_ID, to: 'user@example.com' },
      });

      expect(mockRepoCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          name: 'email.send',
          status: JobStatus.PENDING,
        })
      );
      expect(mockQueueAdd).toHaveBeenCalledWith(
        'email.send',
        expect.objectContaining({ tenantId: TENANT_ID, _jobId: 'job-001' }),
        expect.any(Object)
      );
      expect(mockRepoUpdateStatus).toHaveBeenCalledWith('job-001', JobStatus.QUEUED);
      expect(result.jobId).toBe('job-001');
    });

    it('should update status to FAILED and rethrow if queue.add throws', async () => {
      const dbJob = { id: 'job-fail' };
      mockRepoCreate.mockResolvedValue(dbJob);
      mockQueueAdd.mockRejectedValue(new Error('Redis unavailable'));
      mockRepoUpdateStatus.mockResolvedValue(undefined);

      await expect(
        svc.enqueue({ tenantId: TENANT_ID, name: 'fail.job', payload: { tenantId: TENANT_ID } })
      ).rejects.toMatchObject({ code: JobErrorCode.ENQUEUE_FAILED });

      expect(mockRepoUpdateStatus).toHaveBeenCalledWith(
        'job-fail',
        JobStatus.FAILED,
        expect.any(Object)
      );
    });
  });

  // -------------------------------------------------------------------------
  // schedule()
  // -------------------------------------------------------------------------
  describe('schedule()', () => {
    it('should throw SCHEDULE_FAILED when tenantId is missing', async () => {
      await expect(
        svc.schedule({ tenantId: '', name: 'test', payload: { tenantId: '' } } as any, {
          cronExpression: '* * * * *',
        })
      ).rejects.toMatchObject({ code: JobErrorCode.SCHEDULE_FAILED, statusCode: 400 });
    });

    it('should create DB record and call upsertJobScheduler for valid cron', async () => {
      // parseExpression already mocked to return {} in beforeEach (default)
      const dbJob = { id: 'sched-001', status: JobStatus.SCHEDULED };
      mockRepoCreate.mockResolvedValue(dbJob);
      mockQueueUpsertJobScheduler.mockResolvedValue(undefined);

      const result = await svc.schedule(
        {
          tenantId: TENANT_ID,
          name: 'daily.report',
          payload: { tenantId: TENANT_ID, report: 'summary' },
        },
        { cronExpression: '0 9 * * *' }
      );

      expect(mockRepoCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          status: JobStatus.SCHEDULED,
          cronExpression: '0 9 * * *',
        })
      );
      expect(mockQueueUpsertJobScheduler).toHaveBeenCalledWith(
        'sched-001',
        expect.objectContaining({ pattern: '0 9 * * *' }),
        expect.any(Object)
      );
      expect(result.jobId).toBe('sched-001');
    });

    it('should throw INVALID_CRON for an invalid cron expression', async () => {
      // 'not-a-cron' is genuinely invalid — the real cron-parser library will throw
      await expect(
        svc.schedule(
          { tenantId: TENANT_ID, name: 'bad.cron', payload: { tenantId: TENANT_ID } },
          { cronExpression: 'not-a-cron' }
        )
      ).rejects.toMatchObject({ code: JobErrorCode.INVALID_CRON, statusCode: 400 });
    });
  });

  // -------------------------------------------------------------------------
  // cancel()
  // -------------------------------------------------------------------------
  describe('cancel()', () => {
    it('should throw JOB_NOT_FOUND when the job does not exist', async () => {
      mockRepoFindById.mockResolvedValue(null);

      await expect(svc.cancel('missing-id', TENANT_ID)).rejects.toMatchObject({
        code: JobErrorCode.JOB_NOT_FOUND,
        statusCode: 404,
      });
    });

    it('should throw ALREADY_CANCELLED when job is already cancelled', async () => {
      mockRepoFindById.mockResolvedValue({ id: 'job-c', status: JobStatus.CANCELLED });

      await expect(svc.cancel('job-c', TENANT_ID)).rejects.toMatchObject({
        code: JobErrorCode.ALREADY_CANCELLED,
        statusCode: 409,
      });
    });

    it('should remove from BullMQ and update status to CANCELLED', async () => {
      mockRepoFindById.mockResolvedValue({ id: 'job-active', status: JobStatus.QUEUED });
      mockQueueGetJob.mockResolvedValue({ remove: vi.fn().mockResolvedValue(undefined) });
      mockQueueRemoveJobScheduler.mockResolvedValue(undefined);
      mockRepoUpdateStatus.mockResolvedValue(undefined);

      await svc.cancel('job-active', TENANT_ID);

      expect(mockRepoUpdateStatus).toHaveBeenCalledWith('job-active', JobStatus.CANCELLED);
    });
  });

  // -------------------------------------------------------------------------
  // getStatus()
  // -------------------------------------------------------------------------
  describe('getStatus()', () => {
    it('should throw JOB_NOT_FOUND when job is not in DB', async () => {
      mockRepoFindById.mockResolvedValue(null);

      await expect(svc.getStatus('ghost-id', TENANT_ID)).rejects.toMatchObject({
        code: JobErrorCode.JOB_NOT_FOUND,
        statusCode: 404,
      });
    });

    it('should return status result for an existing job', async () => {
      const now = new Date();
      mockRepoFindById.mockResolvedValue({
        id: 'job-existing',
        status: JobStatus.COMPLETED,
        retries: 1,
        error: null,
        startedAt: now,
        completedAt: now,
      });

      const result = await svc.getStatus('job-existing', TENANT_ID);

      expect(result).toMatchObject({
        jobId: 'job-existing',
        status: JobStatus.COMPLETED,
        retries: 1,
        startedAt: now,
        completedAt: now,
      });
    });
  });
});
