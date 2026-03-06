// File: apps/core-api/src/modules/jobs/job-queue.service.ts
// Spec 007 T007-08: JobQueueService — BullMQ-backed job queue
// FR-007: enqueue, FR-008: process with retries, FR-009: schedule cron
// FR-010: every job payload must include tenantId
// NFR-003: enqueue <50ms P95, NFR-006: at-least-once delivery

import { Queue, QueueOptions, ConnectionOptions } from 'bullmq';
const CronParserLib = require('cron-parser') as {
  CronExpressionParser: { parse: (expr: string) => unknown };
};
import { redis } from '../../lib/redis.js';
import { logger } from '../../lib/logger.js';
import {
  IJobQueueService,
  Job,
  JobStatus,
  EnqueueOptions,
  ScheduleOptions,
  JobEnqueueResult,
  JobStatusResult,
  JobErrorCode,
} from '../../types/core-services.types.js';
import { JobRepository } from './job.repository.js';

// ============================================================================
// Constants
// ============================================================================

export const QUEUE_NAME = 'plexica-jobs';

// ============================================================================
// JobQueueService
// ============================================================================

export class JobQueueService implements IJobQueueService {
  private queue: Queue;
  private repository: JobRepository;

  constructor(repository: JobRepository) {
    this.repository = repository;

    const queueOpts: QueueOptions = {
      connection: redis as unknown as ConnectionOptions,
      defaultJobOptions: {
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 200 },
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
      },
    };

    this.queue = new Queue(QUEUE_NAME, queueOpts);
  }

  /** Expose the underlying BullMQ Queue for the Worker to connect to */
  getQueue(): Queue {
    return this.queue;
  }

  // --------------------------------------------------------------------------
  // Enqueue a one-time job
  // --------------------------------------------------------------------------

  /**
   * Enqueue a one-time job for immediate or delayed processing.
   * NFR-003: <50ms P95 (local Redis round-trip)
   * FR-010: payload must include tenantId (validated in types)
   */
  async enqueue(job: Job, options: EnqueueOptions = {}): Promise<JobEnqueueResult> {
    if (!job.tenantId) {
      throw Object.assign(new Error('job.tenantId is required'), {
        code: JobErrorCode.ENQUEUE_FAILED,
        statusCode: 400,
      });
    }

    // Create a DB record first (PENDING status)
    const dbJob = await this.repository.create({
      ...job,
      status: JobStatus.PENDING,
      maxRetries: options.maxRetries ?? job.maxRetries ?? 3,
    });

    try {
      const _bullJob = await this.queue.add(
        job.name,
        {
          ...job.payload,
          tenantId: job.tenantId, // FR-010: always include tenantId
          _jobId: dbJob.id, // back-reference for status updates
        },
        {
          delay: options.delay,
          priority: options.priority,
          attempts: options.maxRetries ?? job.maxRetries ?? 3,
          jobId: dbJob.id, // use DB id as BullMQ job id for idempotency
        }
      );

      // Update DB status to QUEUED
      await this.repository.updateStatus(dbJob.id, JobStatus.QUEUED);

      logger.info(
        { tenantId: job.tenantId, jobId: dbJob.id, name: job.name },
        '[JobQueueService] job enqueued'
      );

      return { jobId: dbJob.id };
    } catch (err) {
      await this.repository.updateStatus(dbJob.id, JobStatus.FAILED, {
        error: (err as Error).message,
      });
      throw Object.assign(err as Error, { code: JobErrorCode.ENQUEUE_FAILED, statusCode: 500 });
    }
  }

  // --------------------------------------------------------------------------
  // Schedule a recurring cron job
  // --------------------------------------------------------------------------

  /**
   * Schedule a recurring cron job.
   * Edge Case #5: validate cron expression; reject invalid.
   */
  async schedule(job: Job, options: ScheduleOptions): Promise<JobEnqueueResult> {
    if (!job.tenantId) {
      throw Object.assign(new Error('job.tenantId is required'), {
        code: JobErrorCode.SCHEDULE_FAILED,
        statusCode: 400,
      });
    }

    // Validate cron expression (Edge Case #5)
    try {
      CronParserLib.CronExpressionParser.parse(options.cronExpression);
    } catch {
      throw Object.assign(new Error(`Invalid cron expression: "${options.cronExpression}"`), {
        code: JobErrorCode.INVALID_CRON,
        statusCode: 400,
      });
    }

    const dbJob = await this.repository.create({
      ...job,
      status: JobStatus.SCHEDULED,
      cronExpression: options.cronExpression,
      maxRetries: job.maxRetries ?? 3,
    });

    try {
      await this.queue.upsertJobScheduler(
        dbJob.id,
        {
          pattern: options.cronExpression,
          tz: options.timezone ?? 'UTC',
        },
        {
          name: job.name,
          data: {
            ...job.payload,
            tenantId: job.tenantId,
            _jobId: dbJob.id,
          },
          opts: {
            attempts: job.maxRetries ?? 3,
          },
        }
      );

      logger.info(
        { tenantId: job.tenantId, jobId: dbJob.id, cron: options.cronExpression },
        '[JobQueueService] cron job scheduled'
      );

      return { jobId: dbJob.id };
    } catch (err) {
      await this.repository.updateStatus(dbJob.id, JobStatus.FAILED, {
        error: (err as Error).message,
      });
      throw Object.assign(err as Error, { code: JobErrorCode.SCHEDULE_FAILED, statusCode: 500 });
    }
  }

  // --------------------------------------------------------------------------
  // Cancel a job
  // --------------------------------------------------------------------------

  async cancel(jobId: string, tenantId: string): Promise<void> {
    const dbJob = await this.repository.findById(jobId, tenantId);
    if (!dbJob) {
      throw Object.assign(new Error(`Job not found: ${jobId}`), {
        code: JobErrorCode.JOB_NOT_FOUND,
        statusCode: 404,
      });
    }

    if (dbJob.status === JobStatus.CANCELLED) {
      throw Object.assign(new Error(`Job ${jobId} is already cancelled`), {
        code: JobErrorCode.ALREADY_CANCELLED,
        statusCode: 409,
      });
    }

    // Remove from BullMQ queue if present
    try {
      const bullJob = await this.queue.getJob(jobId);
      if (bullJob) {
        await bullJob.remove();
      }
      // Also remove scheduled job if it exists
      await this.queue.removeJobScheduler(jobId);
    } catch {
      // Ignore BullMQ errors — job may already have completed or not exist
    }

    await this.repository.updateStatus(jobId, JobStatus.CANCELLED);
    logger.info({ tenantId, jobId }, '[JobQueueService] job cancelled');
  }

  // --------------------------------------------------------------------------
  // Get job status
  // --------------------------------------------------------------------------

  async getStatus(jobId: string, tenantId: string): Promise<JobStatusResult> {
    const dbJob = await this.repository.findById(jobId, tenantId);
    if (!dbJob) {
      throw Object.assign(new Error(`Job not found: ${jobId}`), {
        code: JobErrorCode.JOB_NOT_FOUND,
        statusCode: 404,
      });
    }

    return {
      jobId: dbJob.id,
      status: dbJob.status as JobStatus,
      retries: dbJob.retries,
      error: dbJob.error ?? undefined,
      startedAt: dbJob.startedAt ?? undefined,
      completedAt: dbJob.completedAt ?? undefined,
    };
  }

  // --------------------------------------------------------------------------
  // Graceful shutdown
  // --------------------------------------------------------------------------

  async close(): Promise<void> {
    await this.queue.close();
  }
}
