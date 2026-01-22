/**
 * Event Metrics Routes
 *
 * Expose Prometheus metrics for the event system
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eventMetrics } from '@plexica/event-bus';

export default async function metricsRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/metrics/events
   *
   * Returns Prometheus metrics for the event system
   */
  fastify.get(
    '/events',
    {
      schema: {
        description: 'Get event system metrics in Prometheus format',
        tags: ['metrics'],
        response: {
          200: {
            type: 'string',
            description: 'Prometheus metrics in text format',
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const metrics = await eventMetrics.getMetrics();

        reply.type('text/plain; version=0.0.4').send(metrics);
      } catch (error) {
        fastify.log.error('Error getting event metrics:', error);
        reply.status(500).send({ error: 'Failed to retrieve metrics' });
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
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Only allow in development mode
        if (process.env.NODE_ENV === 'production') {
          return reply.status(403).send({
            error: 'Metrics reset is not allowed in production',
          });
        }

        eventMetrics.reset();

        reply.send({
          success: true,
          message: 'Event metrics reset successfully',
        });
      } catch (error) {
        fastify.log.error('Error resetting event metrics:', error);
        reply.status(500).send({ error: 'Failed to reset metrics' });
      }
    }
  );
}
