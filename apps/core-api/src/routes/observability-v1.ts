/**
 * Observability V1 Routes
 *
 * Spec 012, Tasks T012-25 and T012-46 (ADR-026, ADR-027, ADR-028, ADR-030).
 *
 * All endpoints are registered under /api/v1/observability and require
 * super_admin authentication (FR-036).
 *
 * Constitution Compliance:
 *   - Article 1.2 §1 (Security First): all routes require super_admin auth
 *   - Article 3.4 (API Standards): versioned endpoints, standard error format
 *   - Article 5.3 (Input Validation): Zod validation on all query params
 *   - Article 6.2 (Error Response Format): { error: { code, message } }
 *
 * Endpoints:
 *   GET /api/v1/observability/plugins/health-summary  — FR-026
 *   GET /api/v1/observability/plugins/:id/query        — FR-028
 *   GET /api/v1/observability/plugins/:id/logs         — FR-018
 *   GET /api/v1/observability/alerts                   — FR-022
 *   GET /api/v1/observability/alerts/history           — FR-023
 *   GET /api/v1/observability/traces                   — FR-030
 *   GET /api/v1/observability/traces/:traceId          — FR-031
 */

import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { requireSuperAdmin, authMiddleware } from '../middleware/auth.js';
import {
  observabilityService,
  InvalidQueryError,
  InvalidTimeRangeError,
  TraceNotFoundError,
  ObservabilityBackendError,
} from '../services/observability.service.js';
import { MetricsQuerySchema } from '../schemas/observability.schema.js';

// ---------------------------------------------------------------------------
// Route-layer plugin ID validation (CRITICAL-1 — Art. 5.3)
// Matches the same pattern enforced by assertSafePluginId() in observability.service.ts.
// Validating at the route layer returns a clean 400 before the request reaches
// the service layer, providing defence-in-depth against PromQL/LogQL injection.
// ---------------------------------------------------------------------------
const SAFE_PLUGIN_ID_SCHEMA = z
  .string()
  .min(1)
  .max(64)
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    'Plugin ID must contain only alphanumeric characters, hyphens, or underscores'
  );

// ---------------------------------------------------------------------------
// Query parameter schemas (Art. 5.3 — Zod validation on all external input)
// ---------------------------------------------------------------------------

const PluginMetricsQuerySchema = z.object({
  query: z.string().min(1).max(500),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/, 'Must be RFC3339 datetime'),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/, 'Must be RFC3339 datetime'),
  step: z
    .string()
    .regex(/^\d+[smh]$/, 'Duration must be e.g. "15s", "5m"')
    .default('60s'),
});

const AlertsQuerySchema = z.object({
  severity: z.enum(['critical', 'warning', 'info']).optional(),
});

const AlertHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(20),
});

const TracesQuerySchema = z.object({
  service: z.string().min(1).max(255).optional(),
  traceId: z.string().min(1).max(255).optional(),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/, 'Must be RFC3339 datetime'),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/, 'Must be RFC3339 datetime'),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const PluginLogsQuerySchema = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/, 'Must be RFC3339 datetime'),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/, 'Must be RFC3339 datetime'),
  query: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
});

// ---------------------------------------------------------------------------
// Error mapping helpers
// ---------------------------------------------------------------------------

function mapServiceError(err: unknown, reply: FastifyReply): ReturnType<FastifyReply['send']> {
  if (err instanceof InvalidQueryError) {
    return reply.code(400).send({
      error: { code: 'INVALID_QUERY', message: err.message },
    });
  }
  if (err instanceof InvalidTimeRangeError) {
    return reply.code(400).send({
      error: { code: 'INVALID_TIME_RANGE', message: err.message },
    });
  }
  if (err instanceof TraceNotFoundError) {
    return reply.code(404).send({
      error: { code: 'TRACE_NOT_FOUND', message: err.message },
    });
  }
  if (err instanceof ObservabilityBackendError) {
    return reply.code(502).send({
      error: {
        code: 'OBSERVABILITY_BACKEND_UNAVAILABLE',
        message: err.message,
      },
    });
  }
  return reply.code(500).send({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
  });
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export const observabilityRoutes: FastifyPluginAsync = async (fastify) => {
  // =========================================================================
  // GET /api/v1/observability/plugins/health-summary  (FR-026)
  //
  // Returns aggregated health data for all ACTIVE plugins. Must be registered
  // BEFORE the parameterised /:id routes to avoid route conflicts.
  // =========================================================================
  fastify.get(
    '/plugins/health-summary',
    {
      preHandler: [authMiddleware, requireSuperAdmin],
      schema: {
        description:
          'Return aggregated health data (status, latency, error rate) for all ACTIVE plugins. ' +
          'Accepts optional time range and plugin ID filter. Fails open — if Prometheus is ' +
          'unreachable, returns summaries with null metrics rather than returning an error.',
        tags: ['observability'],
        querystring: {
          type: 'object',
          properties: {
            from: { type: 'string', description: 'Start of query window (ISO 8601)' },
            to: { type: 'string', description: 'End of query window (ISO 8601)' },
            pluginId: { type: 'string', description: 'Filter to a specific plugin ID' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    pluginId: { type: 'string' },
                    pluginName: { type: 'string' },
                    scraped: { type: 'boolean' },
                    requestCount: { type: ['number', 'null'] },
                    p95LatencySeconds: { type: ['number', 'null'] },
                    errorRate: { type: ['number', 'null'] },
                    lastScrapedAt: { type: ['string', 'null'] },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = MetricsQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send({
          error: {
            code: 'INVALID_QUERY',
            message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
          },
        });
      }
      try {
        const summaries = await observabilityService.getPluginSummaries(parsed.data);
        return reply.code(200).send({ data: summaries });
      } catch (err) {
        request.log.error(err, 'getPluginSummaries failed');
        return mapServiceError(err, reply);
      }
    }
  );

  // =========================================================================
  // GET /api/v1/observability/plugins/:id/query  (FR-028)
  //
  // Proxy a PromQL range query scoped to a specific plugin.
  // =========================================================================
  fastify.get<{ Params: { id: string } }>(
    '/plugins/:id/query',
    {
      preHandler: [authMiddleware, requireSuperAdmin],
      schema: {
        description:
          'Proxy a PromQL range query to Prometheus, scoped to the given plugin ID. ' +
          'The query metric name must be on the allowlist (ADR-030). ' +
          'plugin_id label is automatically injected.',
        tags: ['observability'],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', description: 'Plugin ID' },
          },
        },
        querystring: {
          type: 'object',
          required: ['start', 'end'],
          properties: {
            query: { type: 'string', description: 'PromQL expression (metric name allowlisted)' },
            start: { type: 'string', description: 'Start time (RFC3339)' },
            end: { type: 'string', description: 'End time (RFC3339)' },
            step: { type: 'string', description: 'Step duration (e.g. "15s", "5m")' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              data: {
                type: 'object',
                properties: {
                  resultType: { type: 'string' },
                  result: { type: 'array' },
                },
              },
            },
          },
          400: {
            type: 'object',
            properties: {
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          502: {
            type: 'object',
            properties: {
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params;
      const idValidation = SAFE_PLUGIN_ID_SCHEMA.safeParse(id);
      if (!idValidation.success) {
        return reply.code(400).send({
          error: {
            code: 'INVALID_PLUGIN_ID',
            message: idValidation.error.issues[0]?.message ?? 'Invalid plugin ID',
          },
        });
      }
      const parsed = PluginMetricsQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send({
          error: {
            code: 'INVALID_QUERY',
            message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
          },
        });
      }
      try {
        const result = await observabilityService.queryPluginMetrics(
          id,
          parsed.data.query,
          parsed.data.start,
          parsed.data.end,
          parsed.data.step
        );
        return reply.code(200).send({ data: result.data });
      } catch (err) {
        request.log.warn({ pluginId: id, err }, 'queryPluginMetrics failed');
        return mapServiceError(err, reply);
      }
    }
  );

  // =========================================================================
  // GET /api/v1/observability/plugins/:id/logs  (FR-018)
  //
  // Query plugin logs from Loki with optional LogQL filter.
  // =========================================================================
  fastify.get<{ Params: { id: string } }>(
    '/plugins/:id/logs',
    {
      preHandler: [authMiddleware, requireSuperAdmin],
      schema: {
        description:
          'Query plugin logs from Loki. Supports optional LogQL pipe-filter expressions ' +
          '(e.g. |= "error"). Returns paginated log entries.',
        tags: ['observability'],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', description: 'Plugin ID' },
          },
        },
        querystring: {
          type: 'object',
          required: ['start', 'end'],
          properties: {
            start: { type: 'string', description: 'Start time (RFC3339)' },
            end: { type: 'string', description: 'End time (RFC3339)' },
            query: { type: 'string', description: 'LogQL filter expression (e.g. |= "error")' },
            limit: { type: 'number', description: 'Max log entries (default 100, max 1000)' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              data: { type: 'array' },
              pagination: {
                type: 'object',
                properties: {
                  total: { type: 'number' },
                  limit: { type: 'number' },
                  hasMore: { type: 'boolean' },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params;
      const idValidation = SAFE_PLUGIN_ID_SCHEMA.safeParse(id);
      if (!idValidation.success) {
        return reply.code(400).send({
          error: {
            code: 'INVALID_PLUGIN_ID',
            message: idValidation.error.issues[0]?.message ?? 'Invalid plugin ID',
          },
        });
      }
      const parsed = PluginLogsQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send({
          error: {
            code: 'INVALID_QUERY',
            message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
          },
        });
      }
      try {
        const result = await observabilityService.getPluginLogs(
          id,
          parsed.data.start,
          parsed.data.end,
          parsed.data.query,
          parsed.data.limit
        );
        return reply.code(200).send(result);
      } catch (err) {
        request.log.warn({ pluginId: id, err }, 'getPluginLogs failed');
        return mapServiceError(err, reply);
      }
    }
  );

  // =========================================================================
  // GET /api/v1/observability/alerts  (FR-022)
  //
  // Currently-firing Prometheus alerts. Must be registered BEFORE
  // /alerts/history to prevent route conflict.
  // =========================================================================
  fastify.get(
    '/alerts',
    {
      preHandler: [authMiddleware, requireSuperAdmin],
      schema: {
        description:
          'Return currently-firing Prometheus alerts. ' +
          'Optionally filter by severity (critical, warning, info).',
        tags: ['observability'],
        querystring: {
          type: 'object',
          properties: {
            severity: {
              type: 'string',
              enum: ['critical', 'warning', 'info'],
              description: 'Filter by alert severity',
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    alertName: { type: 'string' },
                    severity: { type: 'string' },
                    pluginId: { type: ['string', 'null'] },
                    description: { type: 'string' },
                    state: { type: 'string' },
                    activeAt: { type: ['string', 'null'] },
                    value: { type: ['string', 'null'] },
                  },
                },
              },
            },
          },
          502: {
            type: 'object',
            properties: { error: { type: 'object' } },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = AlertsQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send({
          error: {
            code: 'INVALID_QUERY',
            message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
          },
        });
      }
      try {
        const alerts = await observabilityService.getActiveAlerts(parsed.data.severity);
        return reply.code(200).send({ data: alerts });
      } catch (err) {
        request.log.warn({ err }, 'getActiveAlerts failed');
        return mapServiceError(err, reply);
      }
    }
  );

  // =========================================================================
  // GET /api/v1/observability/alerts/history  (FR-023)
  //
  // Resolved alerts from last 7 days, paginated.
  // =========================================================================
  fastify.get(
    '/alerts/history',
    {
      preHandler: [authMiddleware, requireSuperAdmin],
      schema: {
        description: 'Return resolved alerts from the last 7 days, paginated (max 100 per page).',
        tags: ['observability'],
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'number', description: 'Page number (default 1)' },
            per_page: { type: 'number', description: 'Items per page (default 20, max 100)' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              data: { type: 'array' },
              pagination: {
                type: 'object',
                properties: {
                  page: { type: 'number' },
                  per_page: { type: 'number' },
                  total: { type: 'number' },
                  total_pages: { type: 'number' },
                },
              },
            },
          },
          502: {
            type: 'object',
            properties: {
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = AlertHistoryQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send({
          error: {
            code: 'INVALID_QUERY',
            message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
          },
        });
      }
      try {
        const result = await observabilityService.getAlertHistory(
          parsed.data.page,
          parsed.data.per_page
        );
        return reply.code(200).send(result);
      } catch (err) {
        request.log.warn({ err }, 'getAlertHistory failed');
        return mapServiceError(err, reply);
      }
    }
  );

  // =========================================================================
  // GET /api/v1/observability/traces  (FR-030)
  //
  // Search traces via the Tempo HTTP search API. Must be registered BEFORE
  // /traces/:traceId to avoid route conflicts.
  // =========================================================================
  fastify.get(
    '/traces',
    {
      preHandler: [authMiddleware, requireSuperAdmin],
      schema: {
        description:
          'Search traces via the Tempo HTTP API. Returns simplified trace metadata. ' +
          'Requires start and end time parameters.',
        tags: ['observability'],
        querystring: {
          type: 'object',
          required: ['start', 'end'],
          properties: {
            service: { type: 'string', description: 'Filter by service name' },
            traceId: { type: 'string', description: 'Filter by trace ID' },
            start: { type: 'string', description: 'Start time (RFC3339)' },
            end: { type: 'string', description: 'End time (RFC3339)' },
            limit: { type: 'number', description: 'Max traces (default 20, max 100)' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    traceId: { type: 'string' },
                    rootService: { type: 'string' },
                    durationMs: { type: 'number' },
                    spanCount: { type: 'number' },
                    status: { type: 'string' },
                    startTime: { type: ['string', 'null'] },
                  },
                },
              },
              pagination: {
                type: 'object',
                properties: {
                  total: { type: 'number' },
                  limit: { type: 'number' },
                  hasMore: { type: 'boolean' },
                },
              },
            },
          },
          400: {
            type: 'object',
            properties: {
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          502: {
            type: 'object',
            properties: {
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = TracesQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send({
          error: {
            code: 'INVALID_QUERY',
            message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
          },
        });
      }
      try {
        const result = await observabilityService.searchTraces(parsed.data);
        return reply.code(200).send(result);
      } catch (err) {
        request.log.warn({ err }, 'searchTraces failed');
        return mapServiceError(err, reply);
      }
    }
  );

  // =========================================================================
  // GET /api/v1/observability/traces/:traceId  (FR-031)
  //
  // Full trace retrieval from Tempo, returned as a nested span tree.
  // =========================================================================
  fastify.get<{ Params: { traceId: string } }>(
    '/traces/:traceId',
    {
      preHandler: [authMiddleware, requireSuperAdmin],
      schema: {
        description: 'Retrieve a full trace from Tempo by trace ID. Returns a nested span tree.',
        tags: ['observability'],
        params: {
          type: 'object',
          required: ['traceId'],
          properties: {
            traceId: { type: 'string', description: 'Trace ID' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              data: {
                type: 'object',
                properties: {
                  traceId: { type: 'string' },
                  rootService: { type: 'string' },
                  durationMs: { type: 'number' },
                  spans: { type: 'array' },
                },
              },
            },
          },
          404: {
            type: 'object',
            properties: {
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          502: {
            type: 'object',
            properties: {
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { traceId: string } }>, reply: FastifyReply) => {
      const { traceId } = request.params;
      try {
        const detail = await observabilityService.getTrace(traceId);
        return reply.code(200).send({ data: detail });
      } catch (err) {
        request.log.warn({ traceId, err }, 'getTrace failed');
        return mapServiceError(err, reply);
      }
    }
  );
};
