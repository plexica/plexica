/**
 * Event Metrics Routes
 *
 * Expose Prometheus metrics for the event system
 */

import type { FastifyPluginAsync } from 'fastify';
import { eventMetrics } from '@plexica/event-bus';
import { requireSuperAdmin } from '../middleware/auth.js';

const metricsRoutes: FastifyPluginAsync = async (fastify) => {
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
