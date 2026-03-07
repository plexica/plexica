/**
 * Metrics Routes
 *
 * Expose Prometheus metrics for the core-api and event system.
 *
 * Spec 012, Task T012-08 (ADR-027).
 *
 * Routes:
 *   GET /metrics          — merged core-api + event-bus registries (Prometheus scrape target)
 *   GET /api/metrics/events    — event-bus metrics only (legacy, kept for backward compat)
 *   POST /api/metrics/events/reset — reset event metrics (non-production only)
 */

import type { FastifyPluginAsync } from 'fastify';
import { eventMetrics } from '@plexica/event-bus';
import { Registry } from 'prom-client';
import { requireSuperAdmin } from '../middleware/auth.js';
import { metricsService } from '../services/metrics.service.js';

const metricsRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /metrics
   *
   * Prometheus scrape endpoint — merges the core-api registry (MetricsService)
   * and the event-bus registry (EventMetrics) into a single response.
   *
   * ADR-027: Single merged registry at GET /metrics.
   * Protected by requireSuperAdmin so the bearer token is validated by Prometheus.
   */
  fastify.get(
    '/',
    {
      preHandler: [requireSuperAdmin],
      schema: {
        description:
          'Merged Prometheus metrics scrape endpoint (core-api + event-bus + plugin registries). Scraped by Prometheus — ADR-027.',
        tags: ['metrics'],
        response: {
          200: {
            type: 'string',
            description: 'Prometheus metrics in text exposition format v0.0.4',
          },
          500: {
            type: 'object',
            properties: { error: { type: 'string' } },
          },
        },
      },
    },
    async (_request, reply) => {
      try {
        const merged = await Registry.merge([metricsService.registry, eventMetrics.getRegistry()]);
        const output = await merged.metrics();
        return reply.type('text/plain; version=0.0.4').send(output);
      } catch (error) {
        fastify.log.error({ err: error }, 'Error getting merged metrics');
        return reply.status(500).send({ error: 'Failed to retrieve metrics' });
      }
    }
  );

  /**
   * GET /api/metrics/events
   *
   * Returns Prometheus metrics for the event system
   */
  fastify.get(
    '/events',
    {
      preHandler: [requireSuperAdmin],
      schema: {
        description: 'Get event system metrics in Prometheus format',
        tags: ['metrics'],
        response: {
          200: {
            type: 'string',
            description: 'Prometheus metrics in text format',
          },
          500: {
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
        },
      },
    },
    async (_request, reply) => {
      try {
        const metrics = await eventMetrics.getMetrics();

        return reply.type('text/plain; version=0.0.4').send(metrics);
      } catch (error) {
        fastify.log.error({ err: error }, 'Error getting event metrics');
        return reply.status(500).send({ error: 'Failed to retrieve metrics' });
      }
    }
  );

  /**
   * POST /api/metrics/events/reset
   *
   * Reset all event metrics (useful for testing)
   */
  fastify.post(
    '/events/reset',
    {
      preHandler: [requireSuperAdmin],
      schema: {
        description: 'Reset all event metrics (testing only)',
        tags: ['metrics'],
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' },
            },
          },
          403: {
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
          500: {
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
        },
      },
    },
    async (_request, reply) => {
      try {
        // Only allow in non-production environments
        if (process.env.NODE_ENV === 'production') {
          return reply.status(403).send({
            error: 'Metrics reset is not allowed in production',
          });
        }

        eventMetrics.reset();

        return reply.send({
          success: true,
          message: 'Event metrics reset successfully',
        });
      } catch (error) {
        fastify.log.error({ err: error }, 'Error resetting event metrics');
        return reply.status(500).send({ error: 'Failed to reset metrics' });
      }
    }
  );
};

export { metricsRoutes };
export default metricsRoutes;
