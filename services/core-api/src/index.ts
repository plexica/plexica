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
import {
  GLOBAL_RATE_LIMIT,
  rateLimitKeyGenerator,
  rateLimitErrorResponseBuilder,
} from './lib/rate-limit-config.js';
import { configureErrorHandler } from './middleware/error-handler.js';
import { authMiddleware } from './middleware/auth-middleware.js';
import { tenantContextMiddleware } from './middleware/tenant-context.js';
import userRoutes from './modules/user/user-routes.js';
import tenantRoutes from './modules/tenant/tenant-routes.js';

const server = Fastify({ loggerInstance: logger, trustProxy: config.TRUST_PROXY });

// Error handler — applied directly to root instance so it covers all scopes.
// Do NOT use server.register(configureErrorHandler) — that would scope the
// handler to a child plugin context, leaving sibling routes unprotected.
configureErrorHandler(server);

// ---------------------------------------------------------------------------
// Redis — connect eagerly so the first request does not pay the TCP handshake
// cost. lazyConnect:true in redis.ts means connect() is a no-op if already
// connected. Failures are non-fatal: @fastify/rate-limit fails open (ADR-012).
// ---------------------------------------------------------------------------
try {
  await redis.connect();
} catch {
  logger.warn(
    'Redis unavailable at startup — rate limiting degraded to in-memory (fail-open per ADR-012)'
  );
}

// ---------------------------------------------------------------------------
// Rate limiting — registered before route plugins so all routes are covered.
// Redis-backed for correctness across multiple Node.js processes.
// keyGenerator: IP-based at plugin level (request.user not yet populated here).
// Per-user keying is applied via hook:'preHandler' on individual routes
// (e.g. POST /api/admin/tenants uses its own keyGenerator in preHandler).
// Fails open when Redis is unavailable (ADR-012).
// ---------------------------------------------------------------------------
await server.register(rateLimit, {
  global: true,
  max: GLOBAL_RATE_LIMIT.max,
  timeWindow: GLOBAL_RATE_LIMIT.timeWindow,
  redis,
  keyGenerator: rateLimitKeyGenerator,
  errorResponseBuilder: rateLimitErrorResponseBuilder,
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
