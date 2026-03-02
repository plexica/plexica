// File: apps/core-api/src/modules/jobs/job-queue.singleton.ts
// Shared singleton for JobQueueService — prevents duplicate BullMQ Queue instances
// when multiple route plugins (jobs.routes.ts, search.routes.ts) both need
// a JobQueueService reference. BullMQ opens one Redis connection per Queue
// instance, so sharing a single instance is required for correctness.
// See: decision-log.md TD-010

import { JobQueueService } from './job-queue.service.js';
import { JobRepository } from './job.repository.js';

let _instance: JobQueueService | null = null;

/**
 * Returns the process-wide JobQueueService singleton.
 * Lazy-initialised on first call; subsequent calls return the same instance.
 */
export function getJobQueueServiceInstance(): JobQueueService {
  if (!_instance) {
    _instance = new JobQueueService(new JobRepository());
  }
  return _instance;
}

/**
 * Reset the singleton — intended for use in tests only.
 */
export function _resetJobQueueSingletonForTests(): void {
  _instance = null;
}
