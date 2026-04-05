// index.ts
// Fastify server bootstrap — entry point for core-api.
// Route scopes:
//   Public    — no auth, no tenant context (health, tenants/resolve)
//   Admin     — auth only, no tenant context (admin/tenants*) — ID-003
//   Tenant    — auth + tenant context (all tenant-scoped routes)

import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';

import { config } from './lib/config.js';
import { disconnectDatabase } from './lib/database.js';
import { logger } from './lib/logger.js';
import { redis, disconnectRedis } from './lib/redis.js';
import { configureErrorHandler } from './middleware/error-handler.js';
import { authMiddleware } from './middleware/auth-middleware.js';
import { tenantContextMiddleware } from './middleware/tenant-context.js';
import userRoutes from './modules/user/user-routes.js';
import tenantRoutes from './modules/tenant/tenant-routes.js';

import type { errorResponseBuilderContext } from '@fastify/rate-limit';

const server = Fastify({ loggerInstance: logger, trustProxy: config.TRUST_PROXY });

// Error handler — applied directly to root instance so it covers all scopes.
// Do NOT use server.register(configureErrorHandler) — that would scope the
// handler to a child plugin context, leaving sibling routes unprotected.
configureErrorHandler(server);

// ---------------------------------------------------------------------------
// Rate limiting — registered before route plugins so all routes are covered.
// Redis-backed for correctness across multiple Node.js processes.
// keyGenerator: IP-based (request.user is not yet populated at onRequest lifecycle).
// Per-user keying is applied via hook:'preHandler' on auth-protected routes
// that need it (e.g. POST /api/admin/tenants uses keyGenerator in preHandler).
// Fails open when Redis is unavailable (ADR-012).
// ---------------------------------------------------------------------------
await server.register(rateLimit, {
  global: true,
  max: 100,
  timeWindow: '1 minute',
  redis,
  keyGenerator: (request) => request.ip,
  errorResponseBuilder: (_request, context: errorResponseBuilderContext) => {
    const body = {
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: `Rate limit exceeded. Retry after ${context.after}.`,
        retryAfter: context.after,
      },
    };
    const err = Object.assign(new Error('Rate limit exceeded'), {
      statusCode: 429,
      rateLimitBody: body,
    });
    return err;
  },
});

// ---------------------------------------------------------------------------
// Public routes — no auth required (Constitution: explicit opt-in)
// ---------------------------------------------------------------------------
server.get('/health', { config: { rateLimit: false } }, async () => ({
  status: 'ok',
  version: '2.0.0',
}));

// Tenant resolve is public (registered inside tenantRoutes, no auth hook here)
await server.register(tenantRoutes);

// ---------------------------------------------------------------------------
// Authenticated + tenant-scoped routes
// ---------------------------------------------------------------------------
await server.register(async (tenantScope) => {
  tenantScope.addHook('preHandler', authMiddleware);
  tenantScope.addHook('preHandler', tenantContextMiddleware);
  await tenantScope.register(userRoutes);
});

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------
async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutdown signal received — closing server');
  await server.close();
  await disconnectDatabase();
  await disconnectRedis();
  logger.info('Server closed gracefully');
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
async function start(): Promise<void> {
  try {
    await server.listen({ port: config.PORT, host: '0.0.0.0' });
  } catch (err) {
    logger.error({ err }, 'Server failed to start');
    process.exit(1);
  }
}

void start();
