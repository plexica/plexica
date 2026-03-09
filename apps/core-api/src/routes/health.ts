import { FastifyPluginAsync } from 'fastify';
import { getPrismaClient } from '@plexica/database';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { getMinioClient } from '../services/minio-client.js';
import { redis } from '../lib/redis.js';

// Read version from package.json at startup
// __dirname is available because tsconfig compiles to CommonJS
const PKG_PATH = resolve(__dirname, '../../package.json');
const APP_VERSION = (JSON.parse(readFileSync(PKG_PATH, 'utf-8')) as { version: string }).version;

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
        const errorMessage =
          process.env.NODE_ENV === 'production'
            ? 'Database check failed'
            : error instanceof Error
              ? error.message
              : 'Unknown error';
        return {
          status: 'not_ready',
          timestamp: new Date().toISOString(),
          checks: {
            database: 'error',
          },
          error: errorMessage,
        };
      }
    }
  );

  // Full health check with detailed info
  // T007-23: Extended with MinIO, job_queue, search, and notifications checks (Spec 007)
  server.get(
    '/',
    {
      schema: {
        tags: ['health'],
        summary: 'Full health check',
        description: 'Returns detailed health information including all service dependencies',
      },
    },
    async (_request, reply) => {
      const checks: Record<string, string> = {};

      // Database check
      try {
        const prisma = getPrismaClient();
        await prisma.$queryRaw`SELECT 1`;
        checks.database = 'ok';
      } catch {
        checks.database = 'error';
      }

      // MinIO check (T007-23 — NFR-001)
      try {
        const healthy = await getMinioClient().healthCheck();
        checks.minio = healthy ? 'ok' : 'error';
      } catch {
        checks.minio = 'error';
      }

      // Job queue check: Redis ping + basic connectivity (T007-23 — NFR-006)
      try {
        const pong = await redis.ping();
        checks.job_queue = pong === 'PONG' ? 'ok' : 'error';
      } catch {
        checks.job_queue = 'error';
      }

      // Search check: verify search_documents table accessible (T007-23 — NFR-004)
      try {
        const prisma = getPrismaClient();
        await (
          prisma as unknown as Record<
            string,
            { count: (args: Record<string, unknown>) => Promise<number> }
          >
        )['searchDocument']?.count({ take: 0 });
        checks.search = 'ok';
      } catch {
        // Table may not exist yet (pre-migration) — degrade gracefully
        checks.search = 'error';
      }

      // Notifications check: SMTP config presence (T007-23 — NFR-005)
      // Skip reachability check to avoid slow health response; just verify config
      try {
        const smtpHost = process.env['SMTP_HOST'];
        checks.notifications = smtpHost ? 'ok' : 'degraded';
      } catch {
        checks.notifications = 'error';
      }

      // Extension registry check: verify extension_slots table accessible (T013-28 — Spec 013)
      try {
        const prisma = getPrismaClient();
        await prisma.$queryRaw`SELECT 1 FROM core.extension_slots LIMIT 1`;
        checks.extension_registry = 'ok';
      } catch {
        // Table may not exist in older deployments (pre-migration) — degrade gracefully
        checks.extension_registry = 'degraded';
      }

      const allOk = Object.values(checks).every((s) => s === 'ok' || s === 'degraded');
      const anyDown = Object.values(checks).some((s) => s === 'error');

      const overallStatus = anyDown ? 'unhealthy' : allOk ? 'healthy' : 'degraded';

      if (anyDown) {
        reply.status(503);
      }

      return {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        version: APP_VERSION,
        checks,
      };
    }
  );
};

export { healthRoutes };
