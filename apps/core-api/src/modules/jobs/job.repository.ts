// File: apps/core-api/src/modules/jobs/job.repository.ts
// Spec 007 T007-08: Prisma-based repository for Job lifecycle persistence
// Stores job status transitions for the admin dashboard and auditing.

import { db } from '../../lib/db.js';
import { JobStatus } from '../../types/core-services.types.js';

// ============================================================================
// Types
// ============================================================================

export interface CreateJobInput {
  tenantId: string;
  name: string;
  pluginId?: string;
  status: JobStatus;
  payload?: Record<string, unknown>;
  maxRetries?: number;
  cronExpression?: string;
}

export interface UpdateJobStatusExtras {
  error?: string;
  result?: Record<string, unknown>;
  startedAt?: Date;
  completedAt?: Date;
}

export interface ListJobsFilter {
  status?: JobStatus;
  name?: string;
  pluginId?: string;
  page?: number;
  limit?: number;
}

export interface DbJob {
  id: string;
  tenantId: string;
  name: string;
  pluginId: string | null;
  status: string;
  payload: unknown;
  result: unknown | null;
  error: string | null;
  retries: number;
  maxRetries: number;
  cronExpression: string | null;
  scheduledAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// JobRepository
// ============================================================================

export class JobRepository {
  // --------------------------------------------------------------------------
  // Create
  // --------------------------------------------------------------------------

  async create(input: CreateJobInput): Promise<DbJob> {
    const job = await (db as any).job.create({
      data: {
        tenantId: input.tenantId,
        name: input.name,
        pluginId: input.pluginId ?? null,
        status: input.status,
        payload: (input.payload as any) ?? {},
        maxRetries: input.maxRetries ?? 3,
        cronExpression: input.cronExpression ?? null,
        retries: 0,
      },
    });
    return job as DbJob;
  }

  // --------------------------------------------------------------------------
  // Update status
  // --------------------------------------------------------------------------

  async updateStatus(
    id: string,
    status: JobStatus,
    extras: UpdateJobStatusExtras = {}
  ): Promise<DbJob> {
    const data: Record<string, unknown> = { status };

    if (extras.error !== undefined) data['error'] = extras.error;
    if (extras.result !== undefined) data['result'] = extras.result as any;
    if (extras.startedAt !== undefined) data['startedAt'] = extras.startedAt;
    if (extras.completedAt !== undefined) data['completedAt'] = extras.completedAt;

    // Increment retries on failure
    if (status === JobStatus.FAILED) {
      data['retries'] = { increment: 1 };
    }

    const job = await (db as any).job.update({ where: { id }, data });
    return job as DbJob;
  }

  // --------------------------------------------------------------------------
  // Find by ID (tenant-scoped for isolation)
  // --------------------------------------------------------------------------

  async findById(id: string, tenantId: string): Promise<DbJob | null> {
    try {
      const job = await (db as any).job.findFirst({
        where: { id, tenantId },
      });
      return job as DbJob | null;
    } catch (err: any) {
      // Prisma throws PrismaClientKnownRequestError for invalid UUID syntax.
      // A non-UUID string can never match a UUID column, so returning null
      // is semantically correct (the job doesn't exist).
      if (
        err.constructor?.name === 'PrismaClientKnownRequestError' ||
        err.code === 'P2023' ||
        (err.message && err.message.includes('invalid input syntax'))
      ) {
        return null;
      }
      throw err;
    }
  }

  // --------------------------------------------------------------------------
  // List jobs for a tenant (paginated)
  // --------------------------------------------------------------------------

  async list(
    tenantId: string,
    filter: ListJobsFilter = {}
  ): Promise<{ jobs: DbJob[]; total: number }> {
    const { status, name, pluginId, page = 1, limit = 50 } = filter;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { tenantId };
    if (status) where['status'] = status;
    if (name) where['name'] = { contains: name, mode: 'insensitive' };
    if (pluginId) where['pluginId'] = pluginId;

    const [jobs, total] = await Promise.all([
      (db as any).job.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      (db as any).job.count({ where }),
    ]);

    return { jobs: jobs as DbJob[], total };
  }
}
