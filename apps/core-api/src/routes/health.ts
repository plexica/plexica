import { FastifyPluginAsync } from 'fastify';
import { getPrismaClient } from '@plexica/database';

const healthRoutes: FastifyPluginAsync = async (server) => {
  // Liveness probe - is the server running?
  server.get(
    '/live',
    {
      schema: {
        tags: ['health'],
        summary: 'Liveness check',
        description: 'Returns 200 if the server is running',
      },
    },
    async (_request, _reply) => {
      return { status: 'ok', timestamp: new Date().toISOString() };
    }
  );

  // Readiness probe - is the server ready to accept requests?
  server.get(
    '/ready',
    {
      schema: {
        tags: ['health'],
        summary: 'Readiness check',
        description: 'Returns 200 if the server is ready to accept requests',
      },
    },
    async (_request, reply) => {
      try {
        // Check database connection
        const prisma = getPrismaClient();
        await prisma.$queryRaw`SELECT 1`;

        return {
          status: 'ready',
          timestamp: new Date().toISOString(),
          checks: {
            database: 'ok',
          },
        };
      } catch (error) {
        reply.status(503);
        return {
          status: 'not_ready',
          timestamp: new Date().toISOString(),
          checks: {
            database: 'error',
          },
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
  );

  // Full health check with detailed info
  server.get(
    '/',
    {
      schema: {
        tags: ['health'],
        summary: 'Full health check',
        description: 'Returns detailed health information',
      },
    },
    async (_request, reply) => {
      const checks: Record<string, string> = {};

      // Database check
      try {
        const prisma = getPrismaClient();
        await prisma.$queryRaw`SELECT 1`;
        checks.database = 'ok';
      } catch (error) {
        checks.database = 'error';
      }

      // TODO: Add more health checks
      // - Redis
      // - Keycloak
      // - Kafka/Redpanda

      const allOk = Object.values(checks).every((status) => status === 'ok');

      if (!allOk) {
        reply.status(503);
      }

      return {
        status: allOk ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        version: '0.1.0',
        checks,
      };
    }
  );
};

export { healthRoutes };
