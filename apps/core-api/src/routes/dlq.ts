import { FastifyPluginAsync } from 'fastify';
import type { DeadLetterQueueService, EventBusService } from '@plexica/event-bus';
import { requireSuperAdmin } from '../middleware/auth.js';

/**
 * Augment FastifyInstance with the eventBus property.
 * The eventBus is registered via server.decorate() in the application setup.
 */
declare module 'fastify' {
  interface FastifyInstance {
    eventBus?: EventBusService;
  }
}

/**
 * Helper to get the DLQ service from the server instance.
 * Returns undefined if eventBus is not registered or DLQ is unavailable.
 */
function getDLQServiceFrom(server: {
  eventBus?: EventBusService;
}): DeadLetterQueueService | undefined {
  return server.eventBus?.getDLQService();
}

/** Shared error response schema for 503 / 500 */
const errorResponseSchema = {
  type: 'object' as const,
  properties: {
    error: { type: 'string' as const },
    message: { type: 'string' as const },
  },
};

/**
 * DLQ Routes
 *
 * REST API endpoints for managing Dead Letter Queue
 */
const dlqRoutes: FastifyPluginAsync = async (server) => {
  /**
   * GET /api/dlq/stats
   * Get DLQ statistics
   */
  server.get(
    '/stats',
    {
      preHandler: [requireSuperAdmin],
      schema: {
        tags: ['dlq'],
        summary: 'Get DLQ statistics',
        description: 'Returns statistics about failed events in the DLQ',
        response: {
          200: {
            type: 'object',
            properties: {
              totalFailed: { type: 'number' },
              pendingRetry: { type: 'number' },
              maxRetriesExceeded: { type: 'number' },
              successfulRetries: { type: 'number' },
              byTopic: { type: 'object' },
              byReason: { type: 'object' },
            },
          },
          500: errorResponseSchema,
          503: errorResponseSchema,
        },
      },
    },
    async (_request, reply) => {
      try {
        const dlqService = getDLQServiceFrom(server);

        if (!dlqService) {
          return reply.code(503).send({
            error: 'DLQ service not available',
          });
        }

        const stats = dlqService.getStats();
        return stats;
      } catch (error) {
        server.log.error({ err: error }, 'Error getting DLQ stats');
        return reply.code(500).send({
          error: 'Failed to get DLQ statistics',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * GET /api/dlq/events
   * List failed events with filtering
   */
  server.get<{
    Querystring: {
      topic?: string;
      tenantId?: string;
      status?: 'pending' | 'max-retries-exceeded';
      limit?: number;
      offset?: number;
    };
  }>(
    '/events',
    {
      preHandler: [requireSuperAdmin],
      schema: {
        tags: ['dlq'],
        summary: 'List failed events',
        description: 'Get failed events from DLQ with optional filtering',
        querystring: {
          type: 'object',
          properties: {
            topic: { type: 'string', description: 'Filter by topic' },
            tenantId: { type: 'string', description: 'Filter by tenant' },
            status: {
              type: 'string',
              enum: ['pending', 'max-retries-exceeded'],
              description: 'Filter by retry status',
            },
            limit: { type: 'number', minimum: 1, maximum: 100, default: 20 },
            offset: { type: 'number', minimum: 0, default: 0 },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              events: { type: 'array' },
              total: { type: 'number' },
              limit: { type: 'number' },
              offset: { type: 'number' },
            },
          },
          500: errorResponseSchema,
          503: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const dlqService = getDLQServiceFrom(server);

        if (!dlqService) {
          return reply.status(503).send({
            error: 'DLQ service not available',
          });
        }

        const { topic, tenantId, status, limit = 20, offset = 0 } = request.query;

        const allEvents = dlqService.getFailedEvents({
          topic,
          tenantId,
          status,
        });

        // Pagination
        const paginatedEvents = allEvents.slice(offset, offset + limit);

        return {
          events: paginatedEvents,
          total: allEvents.length,
          limit,
          offset,
        };
      } catch (error) {
        server.log.error({ err: error }, 'Error listing DLQ events');
        return reply.status(500).send({
          error: 'Failed to list DLQ events',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * GET /api/dlq/events/:id
   * Get a specific failed event
   */
  server.get<{
    Params: {
      id: string;
    };
  }>(
    '/events/:id',
    {
      preHandler: [requireSuperAdmin],
      schema: {
        tags: ['dlq'],
        summary: 'Get failed event details',
        description: 'Get detailed information about a specific failed event',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
          },
          404: {
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
          500: errorResponseSchema,
          503: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const dlqService = getDLQServiceFrom(server);

        if (!dlqService) {
          return reply.status(503).send({
            error: 'DLQ service not available',
          });
        }

        const { id } = request.params;
        const failedEvent = dlqService.getFailedEvent(id);

        if (!failedEvent) {
          return reply.status(404).send({
            error: 'Failed event not found',
          });
        }

        return failedEvent;
      } catch (error) {
        server.log.error({ err: error }, 'Error getting DLQ event');
        return reply.status(500).send({
          error: 'Failed to get DLQ event',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * POST /api/dlq/events/:id/retry
   * Manually retry a failed event
   */
  server.post<{
    Params: {
      id: string;
    };
  }>(
    '/events/:id/retry',
    {
      preHandler: [requireSuperAdmin],
      schema: {
        tags: ['dlq'],
        summary: 'Retry failed event',
        description: 'Manually retry a specific failed event',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' },
            },
          },
          404: {
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
          500: errorResponseSchema,
          503: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const dlqService = getDLQServiceFrom(server);

        if (!dlqService) {
          return reply.status(503).send({
            error: 'DLQ service not available',
          });
        }

        const { id } = request.params;

        // Manual retry (bypass max retries check)
        const success = await dlqService.retryFailedEvent(id, true);

        return {
          success,
          message: success
            ? 'Event retried successfully'
            : 'Event retry failed, check DLQ for details',
        };
      } catch (error) {
        server.log.error({ err: error }, 'Error retrying DLQ event');

        if (error instanceof Error && error.message.includes('not found')) {
          return reply.status(404).send({
            error: error.message,
          });
        }

        return reply.status(500).send({
          error: 'Failed to retry event',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * POST /api/dlq/retry/topic/:topic
   * Retry all failed events for a topic
   */
  server.post<{
    Params: {
      topic: string;
    };
  }>(
    '/retry/topic/:topic',
    {
      preHandler: [requireSuperAdmin],
      schema: {
        tags: ['dlq'],
        summary: 'Retry all events for topic',
        description: 'Retry all pending failed events for a specific topic',
        params: {
          type: 'object',
          required: ['topic'],
          properties: {
            topic: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              succeeded: { type: 'number' },
              failed: { type: 'number' },
            },
          },
          500: errorResponseSchema,
          503: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const dlqService = getDLQServiceFrom(server);

        if (!dlqService) {
          return reply.status(503).send({
            error: 'DLQ service not available',
          });
        }

        const { topic } = request.params;
        const result = await dlqService.retryAllForTopic(topic);

        return result;
      } catch (error) {
        server.log.error({ err: error }, 'Error retrying events for topic');
        return reply.status(500).send({
          error: 'Failed to retry events',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * DELETE /api/dlq/events/:id
   * Delete a failed event from DLQ
   */
  server.delete<{
    Params: {
      id: string;
    };
  }>(
    '/events/:id',
    {
      preHandler: [requireSuperAdmin],
      schema: {
        tags: ['dlq'],
        summary: 'Delete failed event',
        description: 'Remove a failed event from the DLQ',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' },
            },
          },
          404: {
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
          500: errorResponseSchema,
          503: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const dlqService = getDLQServiceFrom(server);

        if (!dlqService) {
          return reply.status(503).send({
            error: 'DLQ service not available',
          });
        }

        const { id } = request.params;
        await dlqService.deleteFailedEvent(id);

        return {
          success: true,
          message: 'Failed event deleted successfully',
        };
      } catch (error) {
        server.log.error({ err: error }, 'Error deleting DLQ event');

        if (error instanceof Error && error.message.includes('not found')) {
          return reply.status(404).send({
            error: error.message,
          });
        }

        return reply.status(500).send({
          error: 'Failed to delete event',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );
};

export { dlqRoutes };
