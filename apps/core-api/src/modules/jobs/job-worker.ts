// File: apps/core-api/src/modules/jobs/job-worker.ts
// Spec 007 T007-11: BullMQ Worker — processes jobs from the plexica-jobs queue
// FR-008: async job processing with retries
// NFR-006: at-least-once delivery (BullMQ lockDuration handles crash/restart Edge Case #4)
// Art. 6.3: structured Pino logging on job lifecycle

import { Worker, Job as BullJob, WorkerOptions } from 'bullmq';
import { redis } from '../../lib/redis.js';
import { logger } from '../../lib/logger.js';
import { QUEUE_NAME } from './job-queue.service.js';

// ============================================================================
// Job handler types
// ============================================================================

/** A job handler function — receives the BullMQ job and returns any result */
export type JobHandler = (job: BullJob) => Promise<unknown>;

// ============================================================================
// JobHandlerRegistry
// ============================================================================

/**
 * Registry for named job handlers.
 * Register handlers by job name; the worker dispatches to the correct handler.
 */
export class JobHandlerRegistry {
  private handlers = new Map<string, JobHandler>();

  /**
   * Register a handler for a specific job name.
   * @param name - Job name (e.g. "notifications.send-bulk", "search.reindex")
   * @param handler - Async function to process the job
   */
  register(name: string, handler: JobHandler): void {
    this.handlers.set(name, handler);
    logger.debug({ name }, '[JobHandlerRegistry] handler registered');
  }

  /**
   * Dispatch a BullMQ job to its registered handler.
   * Throws if no handler is registered for the job name.
   */
  async dispatch(job: BullJob): Promise<unknown> {
    const handler = this.handlers.get(job.name);
    if (!handler) {
      throw new Error(
        `No handler registered for job "${job.name}". ` +
          `Registered handlers: [${Array.from(this.handlers.keys()).join(', ')}]`
      );
    }
    return handler(job);
  }
}

// ============================================================================
// JobWorker
// ============================================================================

export class JobWorker {
  private worker: Worker | null = null;
  private readonly registry: JobHandlerRegistry;
  private readonly concurrency: number;

  constructor(registry: JobHandlerRegistry) {
    this.registry = registry;
    // QUEUE_CONCURRENCY env var controls parallel job processing (default: 5)
    this.concurrency = parseInt(process.env['QUEUE_CONCURRENCY'] ?? '5', 10);
  }

  /**
   * Start the BullMQ worker.
   * NFR-006: at-least-once delivery — BullMQ's lockDuration (default 30s) ensures
   * that if the worker crashes while processing, the job returns to the queue
   * once the lock expires (Edge Case #4).
   */
  start(): void {
    if (this.worker) {
      logger.warn('[JobWorker] worker already started — ignoring duplicate start()');
      return;
    }

    const workerOptions: WorkerOptions = {
      connection: redis as any,
      concurrency: this.concurrency,
      // lockDuration: 30000 (default) — ensures crash recovery (Edge Case #4)
      lockDuration: 30_000,
    };

    this.worker = new Worker(
      QUEUE_NAME,
      async (job: BullJob) => {
        // FR-010: validate tenantId is present on every job
        const tenantId = job.data?.tenantId as string | undefined;
        if (!tenantId) {
          throw new Error(
            `Job "${job.name}" (id: ${job.id}) is missing tenantId in payload. ` +
              'All jobs must include tenantId (FR-010).'
          );
        }

        logger.info(
          { jobId: job.id, name: job.name, tenantId, attempt: job.attemptsMade + 1 },
          '[JobWorker] processing job'
        );

        const result = await this.registry.dispatch(job);

        logger.info(
          { jobId: job.id, name: job.name, tenantId },
          '[JobWorker] job completed successfully'
        );

        return result;
      },
      workerOptions
    );

    // Worker-level event handlers for lifecycle logging (Art. 6.3)
    this.worker.on('failed', (job: BullJob | undefined, err: Error) => {
      logger.error(
        {
          jobId: job?.id,
          name: job?.name,
          tenantId: job?.data?.tenantId,
          attempt: job?.attemptsMade,
          error: err.message,
        },
        '[JobWorker] job failed'
      );
    });

    this.worker.on('error', (err: Error) => {
      logger.error({ error: err.message }, '[JobWorker] worker error');
    });

    logger.info({ queue: QUEUE_NAME, concurrency: this.concurrency }, '[JobWorker] worker started');
  }

  /**
   * Gracefully stop the worker — waits for in-progress jobs to finish.
   */
  async stop(): Promise<void> {
    if (!this.worker) return;
    await this.worker.close();
    this.worker = null;
    logger.info('[JobWorker] worker stopped');
  }
}

// ============================================================================
// Singleton registry (shared across the app)
// ============================================================================

/** Global handler registry — used by index.ts to register built-in handlers */
export const globalRegistry = new JobHandlerRegistry();

/** Singleton JobWorker instance */
export const jobWorker = new JobWorker(globalRegistry);
