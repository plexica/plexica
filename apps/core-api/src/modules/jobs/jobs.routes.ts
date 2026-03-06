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
import { type UserInfo } from '../../lib/jwt.js';
import { JobRepository } from './job.repository.js';
import { getJobQueueServiceInstance } from './job-queue.singleton.js';
import { JobSchema, JobStatus, JobErrorCode, type Job } from '../../types/core-services.types.js';
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
  // Priority: request.tenant.tenantId (set by tenantContextMiddleware in integration/E2E)
  // → user.tenantSlug (set by authMiddleware) → user.tenantId (unit test mocks)
  const tenantId =
    request.tenant?.tenantId ??
    request.user?.tenantSlug ??
    (request.user as (UserInfo & { tenantSlug: string; tenantId?: string }) | undefined)?.tenantId;
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
  const adminOnly = requireRole(
    USER_ROLES.ADMIN,
    USER_ROLES.TENANT_OWNER,
    USER_ROLES.SUPER_ADMIN,
    USER_ROLES.TENANT_ADMIN
  );

  // --------------------------------------------------------------------------
  // POST /jobs — enqueue a one-time job
  // --------------------------------------------------------------------------
  server.post(
    '/jobs',
    {
      schema: {
        tags: ['jobs'],
        summary: 'Enqueue a job',
        description:
          'Enqueue a one-time job for asynchronous processing. Returns a job ID within <50ms P95 (NFR-003).',
        response: {
          201: {
            description: 'Job enqueued',
            type: 'object',
            additionalProperties: true,
            properties: {
              jobId: { type: 'string', description: 'Unique job identifier' },
              status: { type: 'string', enum: ['PENDING', 'QUEUED'] },
            },
          },
          400: { description: 'Validation error', type: 'object', additionalProperties: true },
          403: {
            description: 'Insufficient permissions',
            type: 'object',
            additionalProperties: true,
          },
          500: { description: 'Failed to enqueue job', type: 'object', additionalProperties: true },
        },
      },
      preHandler: adminOnly,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenantId(request);
      const userId = request.user?.id ?? request.token?.sub;
      const body = request.body as Record<string, unknown>;

      const parsed = JobSchema.safeParse({
        ...body,
        tenantId,
        payload: { ...((body['payload'] as Record<string, unknown>) ?? {}), tenantId },
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
        const result = await svc.enqueue(parsed.data as Job);
        request.log.info(
          { tenantId, userId, jobId: result.jobId, name: parsed.data.name },
          '[JobsRoute] job enqueued'
        );
        return reply.code(201).send(result);
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : 'Failed to enqueue job';
        request.log.error(
          { tenantId, userId, name: parsed.data.name, err: errMsg },
          '[JobsRoute] enqueue failed'
        );
        return reply.code(500).send({
          error: {
            code: JobErrorCode.ENQUEUE_FAILED,
            message: errMsg,
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
        description:
          'Schedule a recurring cron job. The cronExpression field is required and validated.',
        response: {
          201: {
            description: 'Job scheduled',
            type: 'object',
            additionalProperties: true,
            properties: {
              jobId: { type: 'string' },
              status: { type: 'string', enum: ['SCHEDULED'] },
            },
          },
          400: {
            description: 'Missing or invalid cron expression',
            type: 'object',
            additionalProperties: true,
          },
          403: {
            description: 'Insufficient permissions',
            type: 'object',
            additionalProperties: true,
          },
          500: {
            description: 'Failed to schedule job',
            type: 'object',
            additionalProperties: true,
          },
        },
      },
      preHandler: adminOnly,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenantId(request);
      const userId = request.user?.id ?? request.token?.sub;
      const body = request.body as Record<string, unknown>;

      if (!body['cronExpression']) {
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
        const result = await svc.schedule(parsed.data as Job, {
          cronExpression: body['cronExpression'] as string,
          timezone: body['timezone'] as string | undefined,
        });
        request.log.info(
          {
            tenantId,
            userId,
            jobId: result.jobId,
            name: parsed.data.name,
            cron: body['cronExpression'],
          },
          '[JobsRoute] job scheduled'
        );
        return reply.code(201).send(result);
      } catch (err: unknown) {
        const errWithCode = err as Error & { code?: string; message?: string };
        const statusCode = errWithCode.code === JobErrorCode.INVALID_CRON ? 400 : 500;
        request.log.error(
          { tenantId, userId, name: body['name'], err: errWithCode.message },
          '[JobsRoute] schedule failed'
        );
        return reply.code(statusCode).send({
          error: {
            code: errWithCode.code ?? JobErrorCode.SCHEDULE_FAILED,
            message: errWithCode.message ?? 'Failed to schedule job',
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
        description: 'Get the current status of a job by ID, scoped to the authenticated tenant.',
        response: {
          200: { description: 'Job status object', type: 'object', additionalProperties: true },
          404: { description: 'Job not found', type: 'object', additionalProperties: true },
          500: {
            description: 'Failed to get job status',
            type: 'object',
            additionalProperties: true,
          },
        },
      },
      preHandler: adminOnly,
    },
    async (request, reply) => {
      const tenantId = getTenantId(request);
      const userId = request.user?.id ?? request.token?.sub;
      const { id } = request.params;

      try {
        const svc = getJobQueueService();
        const status = await svc.getStatus(id, tenantId);
        request.log.debug(
          { tenantId, userId, jobId: id, status: status.status },
          '[JobsRoute] job status retrieved'
        );
        return reply.send(status);
      } catch (err: unknown) {
        const errWithCode = err as Error & { code?: string; message?: string };
        if (errWithCode.code === JobErrorCode.JOB_NOT_FOUND) {
          request.log.warn({ tenantId, userId, jobId: id }, '[JobsRoute] job not found');
          return reply
            .code(404)
            .send({ error: { code: errWithCode.code, message: errWithCode.message } });
        }
        request.log.error(
          { tenantId, userId, jobId: id, err: errWithCode.message },
          '[JobsRoute] get status failed'
        );
        return reply.code(500).send({
          error: {
            code: 'JOB_STATUS_FAILED',
            message: errWithCode.message ?? 'Failed to get job status',
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
        description:
          'Cancel a pending, queued, or scheduled job. Returns 409 if already cancelled.',
        response: {
          204: { description: 'Job cancelled successfully' },
          404: { description: 'Job not found', type: 'object', additionalProperties: true },
          409: { description: 'Job already cancelled', type: 'object', additionalProperties: true },
          500: { description: 'Failed to cancel job', type: 'object', additionalProperties: true },
        },
      },
      preHandler: adminOnly,
    },
    async (request, reply) => {
      const tenantId = getTenantId(request);
      const userId = request.user?.id ?? request.token?.sub;
      const { id } = request.params;

      try {
        const svc = getJobQueueService();
        await svc.cancel(id, tenantId);
        request.log.info({ tenantId, userId, jobId: id }, '[JobsRoute] job cancelled');
        return reply.code(204).send();
      } catch (err: unknown) {
        const errWithCode = err as Error & { code?: string; message?: string };
        if (errWithCode.code === JobErrorCode.JOB_NOT_FOUND) {
          request.log.warn({ tenantId, userId, jobId: id }, '[JobsRoute] cancel: job not found');
          return reply
            .code(404)
            .send({ error: { code: errWithCode.code, message: errWithCode.message } });
        }
        if (errWithCode.code === JobErrorCode.ALREADY_CANCELLED) {
          request.log.warn(
            { tenantId, userId, jobId: id },
            '[JobsRoute] cancel: job already cancelled'
          );
          return reply
            .code(409)
            .send({ error: { code: errWithCode.code, message: errWithCode.message } });
        }
        request.log.error(
          { tenantId, userId, jobId: id, err: errWithCode.message },
          '[JobsRoute] cancel failed'
        );
        return reply.code(500).send({
          error: {
            code: 'JOB_CANCEL_FAILED',
            message: errWithCode.message ?? 'Failed to cancel job',
          },
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
        response: {
          200: {
            description: 'Paginated list of jobs',
            type: 'object',
            additionalProperties: true,
            properties: {
              jobs: { type: 'array', items: { type: 'object', additionalProperties: true } },
              total: { type: 'integer' },
              page: { type: 'integer' },
              limit: { type: 'integer' },
              pages: { type: 'integer' },
            },
          },
          500: { description: 'Failed to list jobs', type: 'object', additionalProperties: true },
        },
      },
      preHandler: adminOnly,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenantId(request);
      const userId = request.user?.id ?? request.token?.sub;
      const query = request.query as Record<string, string | undefined>;

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
        response: {
          201: {
            description: 'Job re-enqueued',
            type: 'object',
            additionalProperties: true,
            properties: {
              jobId: { type: 'string' },
              status: { type: 'string', enum: ['PENDING', 'QUEUED'] },
            },
          },
          404: { description: 'Job not found', type: 'object', additionalProperties: true },
          422: {
            description: 'Job is not in FAILED status',
            type: 'object',
            additionalProperties: true,
          },
          500: { description: 'Failed to retry job', type: 'object', additionalProperties: true },
        },
      },
      preHandler: adminOnly,
    },
    async (request, reply) => {
      const tenantId = getTenantId(request);
      const userId = request.user?.id ?? request.token?.sub;
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
      } catch (err: unknown) {
        const errWithCode = err as Error & { code?: string; message?: string };
        request.log.error(
          { tenantId, userId, jobId: id, err: errWithCode.message },
          '[JobsRoute] retry enqueue failed'
        );
        return reply.code(500).send({
          error: {
            code: JobErrorCode.ENQUEUE_FAILED,
            message: errWithCode.message ?? 'Failed to retry job',
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
        response: {
          200: {
            description: 'Schedule disabled',
            type: 'object',
            additionalProperties: true,
            properties: {
              message: { type: 'string' },
              jobId: { type: 'string' },
            },
          },
          404: { description: 'Job not found', type: 'object', additionalProperties: true },
          422: {
            description: 'Job is not in SCHEDULED status',
            type: 'object',
            additionalProperties: true,
          },
          500: {
            description: 'Failed to disable schedule',
            type: 'object',
            additionalProperties: true,
          },
        },
      },
      preHandler: adminOnly,
    },
    async (request, reply) => {
      const tenantId = getTenantId(request);
      const userId = request.user?.id ?? request.token?.sub;
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
      } catch (err: unknown) {
        const errWithCode = err as Error & { code?: string; message?: string };
        request.log.error(
          { tenantId, userId, jobId: id, err: errWithCode.message },
          '[JobsRoute] disable-schedule failed'
        );
        return reply.code(500).send({
          error: {
            code: 'JOB_DISABLE_FAILED',
            message: errWithCode.message ?? 'Failed to disable schedule',
          },
        });
      }
    }
  );
};
