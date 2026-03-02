// File: apps/core-api/src/modules/jobs/jobs.routes.ts
// Spec 007 T007-15: Job Queue REST endpoints
// POST   /api/v1/jobs                       — enqueue one-time job
// POST   /api/v1/jobs/schedule              — schedule recurring cron job
// GET    /api/v1/jobs/:id/status            — get job status
// DELETE /api/v1/jobs/:id                   — cancel job
// GET    /api/v1/jobs                       — list jobs (paginated, filtered)
// POST   /api/v1/jobs/:id/retry             — re-enqueue failed job
// PATCH  /api/v1/jobs/:id/schedule/disable  — disable cron schedule

import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { authMiddleware, requireRole } from '../../middleware/auth.js';
import { JobRepository } from './job.repository.js';
import { getJobQueueServiceInstance } from './job-queue.singleton.js';
import { JobSchema, JobStatus, JobErrorCode } from '../../types/core-services.types.js';
import { USER_ROLES } from '../../constants/index.js';

// ============================================================================
// Module-level service singletons (via shared singleton — HIGH #5)
// ============================================================================

function getJobQueueService() {
  return getJobQueueServiceInstance();
}

function getJobRepo(): JobRepository {
  // JobRepository is stateless; a fresh instance per call is fine
  return new JobRepository();
}

// ============================================================================
// Helpers
// ============================================================================

function getTenantId(request: FastifyRequest): string {
  const tenantId = (request as any).user?.tenantId ?? (request as any).tenantContext?.tenantId;
  if (!tenantId)
    throw Object.assign(new Error('Tenant context not available'), { statusCode: 400 });
  return tenantId;
}

// ============================================================================
// Route plugin
// ============================================================================

export const jobsRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', authMiddleware);

  // All job management endpoints are admin-only (HIGH #3)
  const adminOnly = requireRole(USER_ROLES.ADMIN, USER_ROLES.TENANT_OWNER, USER_ROLES.SUPER_ADMIN);

  // --------------------------------------------------------------------------
  // POST /jobs — enqueue a one-time job
  // --------------------------------------------------------------------------
  server.post(
    '/jobs',
    {
      schema: {
        tags: ['jobs'],
        summary: 'Enqueue a job',
        description: 'Enqueue a one-time job for asynchronous processing',
      },
      preHandler: adminOnly,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenantId(request);
      const userId = (request as any).user?.id ?? (request as any).user?.sub;
      const body = request.body as any;

      const parsed = JobSchema.safeParse({
        ...body,
        tenantId,
        payload: { ...(body.payload ?? {}), tenantId },
      });
      if (!parsed.success) {
        request.log.warn(
          { tenantId, userId, code: 'VALIDATION_ERROR' },
          '[JobsRoute] invalid job body'
        );
        return reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid job body',
            details: parsed.error.flatten(),
          },
        });
      }

      try {
        const svc = getJobQueueService();
        const result = await svc.enqueue(parsed.data as any);
        request.log.info(
          { tenantId, userId, jobId: result.jobId, name: parsed.data.name },
          '[JobsRoute] job enqueued'
        );
        return reply.code(201).send(result);
      } catch (err: any) {
        request.log.error(
          { tenantId, userId, name: parsed.data.name, err: err.message },
          '[JobsRoute] enqueue failed'
        );
        return reply.code(500).send({
          error: {
            code: JobErrorCode.ENQUEUE_FAILED,
            message: err.message ?? 'Failed to enqueue job',
          },
        });
      }
    }
  );

  // --------------------------------------------------------------------------
  // POST /jobs/schedule — schedule a cron job
  // --------------------------------------------------------------------------
  server.post(
    '/jobs/schedule',
    {
      schema: {
        tags: ['jobs'],
        summary: 'Schedule a recurring job',
        description: 'Schedule a recurring cron job',
      },
      preHandler: adminOnly,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenantId(request);
      const userId = (request as any).user?.id ?? (request as any).user?.sub;
      const body = request.body as any;

      if (!body.cronExpression) {
        request.log.warn(
          { tenantId, userId, code: JobErrorCode.INVALID_CRON },
          '[JobsRoute] schedule missing cronExpression'
        );
        return reply.code(400).send({
          error: { code: JobErrorCode.INVALID_CRON, message: 'cronExpression is required' },
        });
      }

      const parsed = JobSchema.safeParse({
        ...body,
        tenantId,
        payload: { ...(body.payload ?? {}), tenantId },
      });
      if (!parsed.success) {
        request.log.warn(
          { tenantId, userId, code: 'VALIDATION_ERROR' },
          '[JobsRoute] invalid schedule body'
        );
        return reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid job body',
            details: parsed.error.flatten(),
          },
        });
      }

      try {
        const svc = getJobQueueService();
        const result = await svc.schedule(parsed.data as any, {
          cronExpression: body.cronExpression,
          timezone: body.timezone,
        });
        request.log.info(
          {
            tenantId,
            userId,
            jobId: result.jobId,
            name: parsed.data.name,
            cron: body.cronExpression,
          },
          '[JobsRoute] job scheduled'
        );
        return reply.code(201).send(result);
      } catch (err: any) {
        const statusCode = err.code === JobErrorCode.INVALID_CRON ? 400 : 500;
        request.log.error(
          { tenantId, userId, name: body.name, err: err.message },
          '[JobsRoute] schedule failed'
        );
        return reply.code(statusCode).send({
          error: {
            code: err.code ?? JobErrorCode.SCHEDULE_FAILED,
            message: err.message ?? 'Failed to schedule job',
          },
        });
      }
    }
  );

  // --------------------------------------------------------------------------
  // GET /jobs/:id/status — get job status
  // --------------------------------------------------------------------------
  server.get<{ Params: { id: string } }>(
    '/jobs/:id/status',
    {
      schema: {
        tags: ['jobs'],
        summary: 'Get job status',
        description: 'Get the current status of a job',
      },
      preHandler: adminOnly,
    },
    async (request, reply) => {
      const tenantId = getTenantId(request);
      const userId = (request as any).user?.id ?? (request as any).user?.sub;
      const { id } = request.params;

      try {
        const svc = getJobQueueService();
        const status = await svc.getStatus(id, tenantId);
        request.log.debug(
          { tenantId, userId, jobId: id, status: status.status },
          '[JobsRoute] job status retrieved'
        );
        return reply.send(status);
      } catch (err: any) {
        if (err.code === JobErrorCode.JOB_NOT_FOUND) {
          request.log.warn({ tenantId, userId, jobId: id }, '[JobsRoute] job not found');
          return reply.code(404).send({ error: { code: err.code, message: err.message } });
        }
        request.log.error(
          { tenantId, userId, jobId: id, err: err.message },
          '[JobsRoute] get status failed'
        );
        return reply.code(500).send({
          error: {
            code: 'JOB_STATUS_FAILED',
            message: err.message ?? 'Failed to get job status',
          },
        });
      }
    }
  );

  // --------------------------------------------------------------------------
  // DELETE /jobs/:id — cancel a job
  // --------------------------------------------------------------------------
  server.delete<{ Params: { id: string } }>(
    '/jobs/:id',
    {
      schema: {
        tags: ['jobs'],
        summary: 'Cancel a job',
        description: 'Cancel a pending, queued, or scheduled job',
      },
      preHandler: adminOnly,
    },
    async (request, reply) => {
      const tenantId = getTenantId(request);
      const userId = (request as any).user?.id ?? (request as any).user?.sub;
      const { id } = request.params;

      try {
        const svc = getJobQueueService();
        await svc.cancel(id, tenantId);
        request.log.info({ tenantId, userId, jobId: id }, '[JobsRoute] job cancelled');
        return reply.code(204).send();
      } catch (err: any) {
        if (err.code === JobErrorCode.JOB_NOT_FOUND) {
          request.log.warn({ tenantId, userId, jobId: id }, '[JobsRoute] cancel: job not found');
          return reply.code(404).send({ error: { code: err.code, message: err.message } });
        }
        if (err.code === JobErrorCode.ALREADY_CANCELLED) {
          request.log.warn(
            { tenantId, userId, jobId: id },
            '[JobsRoute] cancel: job already cancelled'
          );
          return reply.code(409).send({ error: { code: err.code, message: err.message } });
        }
        request.log.error(
          { tenantId, userId, jobId: id, err: err.message },
          '[JobsRoute] cancel failed'
        );
        return reply.code(500).send({
          error: { code: 'JOB_CANCEL_FAILED', message: err.message ?? 'Failed to cancel job' },
        });
      }
    }
  );

  // --------------------------------------------------------------------------
  // GET /jobs — list jobs (paginated, filterable by status/plugin/name)
  // --------------------------------------------------------------------------
  server.get(
    '/jobs',
    {
      schema: {
        tags: ['jobs'],
        summary: 'List jobs',
        description: 'List jobs for the tenant with pagination and status filter',
        querystring: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            plugin: { type: 'string' },
            name: { type: 'string' },
            page: { type: 'integer', default: 1 },
            limit: { type: 'integer', default: 50, maximum: 100 },
          },
        },
      },
      preHandler: adminOnly,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenantId(request);
      const userId = (request as any).user?.id ?? (request as any).user?.sub;
      const query = request.query as any;

      const filter = {
        status: query.status as JobStatus | undefined,
        pluginId: query.plugin as string | undefined,
        name: query.name as string | undefined,
        page: parseInt(query.page ?? '1', 10),
        limit: Math.min(parseInt(query.limit ?? '50', 10), 100),
      };

      const repo = getJobRepo();
      const { jobs, total } = await repo.list(tenantId, filter);

      request.log.debug(
        { tenantId, userId, total, page: filter.page, limit: filter.limit },
        '[JobsRoute] jobs listed'
      );

      return reply.send({
        jobs,
        total,
        page: filter.page,
        limit: filter.limit,
        pages: Math.ceil(total / filter.limit),
      });
    }
  );

  // --------------------------------------------------------------------------
  // POST /jobs/:id/retry — re-enqueue a failed job
  // --------------------------------------------------------------------------
  server.post<{ Params: { id: string } }>(
    '/jobs/:id/retry',
    {
      schema: {
        tags: ['jobs'],
        summary: 'Retry a failed job',
        description: 'Re-enqueue a failed job for processing',
      },
      preHandler: adminOnly,
    },
    async (request, reply) => {
      const tenantId = getTenantId(request);
      const userId = (request as any).user?.id ?? (request as any).user?.sub;
      const { id } = request.params;

      const repo = getJobRepo();
      const existing = await repo.findById(id, tenantId);
      if (!existing) {
        request.log.warn({ tenantId, userId, jobId: id }, '[JobsRoute] retry: job not found');
        return reply
          .code(404)
          .send({ error: { code: JobErrorCode.JOB_NOT_FOUND, message: `Job ${id} not found` } });
      }

      if (existing.status !== JobStatus.FAILED) {
        request.log.warn(
          { tenantId, userId, jobId: id, status: existing.status },
          '[JobsRoute] retry: job not in FAILED status'
        );
        return reply.code(422).send({
          error: {
            code: 'JOB_NOT_FAILED',
            message: `Job ${id} is not in FAILED status (current: ${existing.status})`,
          },
        });
      }

      // Re-enqueue with same payload
      try {
        const svc = getJobQueueService();
        const result = await svc.enqueue({
          tenantId,
          name: existing.name,
          pluginId: existing.pluginId ?? undefined,
          payload: existing.payload as Record<string, unknown> & { tenantId: string },
          maxRetries: existing.maxRetries,
        });
        request.log.info(
          { tenantId, userId, originalJobId: id, newJobId: result.jobId, name: existing.name },
          '[JobsRoute] job retried'
        );
        return reply.code(201).send(result);
      } catch (err: any) {
        request.log.error(
          { tenantId, userId, jobId: id, err: err.message },
          '[JobsRoute] retry enqueue failed'
        );
        return reply.code(500).send({
          error: {
            code: JobErrorCode.ENQUEUE_FAILED,
            message: err.message ?? 'Failed to retry job',
          },
        });
      }
    }
  );

  // --------------------------------------------------------------------------
  // PATCH /jobs/:id/schedule/disable — disable cron schedule
  // --------------------------------------------------------------------------
  server.patch<{ Params: { id: string } }>(
    '/jobs/:id/schedule/disable',
    {
      schema: {
        tags: ['jobs'],
        summary: 'Disable cron schedule',
        description: 'Disable the recurring schedule for a scheduled job',
      },
      preHandler: adminOnly,
    },
    async (request, reply) => {
      const tenantId = getTenantId(request);
      const userId = (request as any).user?.id ?? (request as any).user?.sub;
      const { id } = request.params;

      const repo = getJobRepo();
      const existing = await repo.findById(id, tenantId);
      if (!existing) {
        request.log.warn(
          { tenantId, userId, jobId: id },
          '[JobsRoute] disable-schedule: job not found'
        );
        return reply
          .code(404)
          .send({ error: { code: JobErrorCode.JOB_NOT_FOUND, message: `Job ${id} not found` } });
      }

      if (existing.status !== JobStatus.SCHEDULED) {
        request.log.warn(
          { tenantId, userId, jobId: id, status: existing.status },
          '[JobsRoute] disable-schedule: job not in SCHEDULED status'
        );
        return reply.code(422).send({
          error: {
            code: 'JOB_NOT_SCHEDULED',
            message: `Job ${id} is not a scheduled job (current: ${existing.status})`,
          },
        });
      }

      try {
        const svc = getJobQueueService();
        await svc.cancel(id, tenantId);
        request.log.info({ tenantId, userId, jobId: id }, '[JobsRoute] cron schedule disabled');
        return reply.send({ message: 'Schedule disabled', jobId: id });
      } catch (err: any) {
        request.log.error(
          { tenantId, userId, jobId: id, err: err.message },
          '[JobsRoute] disable-schedule failed'
        );
        return reply.code(500).send({
          error: {
            code: 'JOB_DISABLE_FAILED',
            message: err.message ?? 'Failed to disable schedule',
          },
        });
      }
    }
  );
};
