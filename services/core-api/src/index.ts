// index.ts
// Fastify server bootstrap — entry point for core-api.
// Route scopes:
//   Public    — no auth, no tenant context (health, tenants/resolve)
//   Admin     — auth only, no tenant context (admin/tenants*) — ID-003
//   Tenant    — auth + tenant context (all tenant-scoped routes)

import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';

import { config } from './lib/config.js';
import { disconnectDatabase } from './lib/database.js';
import { disconnectKafka } from './lib/kafka.js';
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
import { userProfileResolver } from './middleware/user-profile-resolver.js';
import userRoutes from './modules/user/user-routes.js';
import tenantRoutes from './modules/tenant/tenant-routes.js';
import { workspaceRoutes } from './modules/workspace/routes.js';
import { workspaceMemberRoutes } from './modules/workspace-member/routes.js';
import { invitationRoutes, invitationPublicRoutes } from './modules/invitation/routes.js';
import { userManagementRoutes } from './modules/user-management/routes.js';
import { userProfileRoutes } from './modules/user-profile/routes.js';
import { tenantSettingsRoutes } from './modules/tenant-settings/routes.js';
import { auditLogRoutes } from './modules/audit-log/routes.js';
import { pluginAdminRoutes, pluginTenantRoutes, pluginEventRoutes } from './modules/plugin/index.js';
import { adminRoutes } from './modules/admin/index.js';
import { pluginEventAuth } from './middleware/plugin-event-auth.js';
import { rateLimit as rateLimitMiddleware } from './middleware/rate-limit.js';
import { startDlqConsumer, stopDlqConsumer } from './modules/plugin/events/dlq-consumer.js';

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
// Multipart support — required for file uploads (logo, avatar).
// Must be registered before routes that use request.isMultipart().
// Rate limiting is provided by the global @fastify/rate-limit plugin above
// (global: true, Redis-backed). Per-route config: { rateLimit: ... } is
// set on all upload routes. CodeQL js/missing-rate-limiting is suppressed
// here because the static query cannot trace through Fastify's plugin
// architecture to see the global rate-limit registration at line 63.
// ---------------------------------------------------------------------------
// codeql[js/missing-rate-limiting]
await server.register(multipart, {
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max file size
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

// Public invitation accept endpoint — tenant context required but no auth
await server.register(invitationPublicRoutes);

// Super admin plugin management routes — auth-only scope (no tenant context).
// Also hosts the new admin module (/api/v1/admin/* — Spec 005) which applies
// requireSuperAdmin per route group inside the module plugin itself.
await server.register(async (adminScope) => {
  adminScope.addHook('preHandler', authMiddleware);
  adminScope.addHook('preHandler', rateLimitMiddleware(30, 60000));
  await adminScope.register(pluginAdminRoutes);
  await adminScope.register(adminRoutes);
});

// Plugin event-emission route — dual-auth scope. Plugin backends use an
// X-Plugin-Service-Token (no JWT); user-initiated emissions use a Bearer JWT.
// Registered OUTSIDE the tenantScope because authMiddleware would reject
// service-token requests (no Authorization header) with 401 before the
// handler runs. pluginEventAuth handles both paths.
await server.register(async (eventScope) => {
  eventScope.addHook('preHandler', pluginEventAuth);
  eventScope.addHook('preHandler', rateLimitMiddleware(100, 60000));
  await eventScope.register(pluginEventRoutes);
});

// ---------------------------------------------------------------------------
// Authenticated + tenant-scoped routes
// ---------------------------------------------------------------------------
await server.register(async (tenantScope) => {
  tenantScope.addHook('preHandler', authMiddleware);
  tenantScope.addHook('preHandler', tenantContextMiddleware);
  tenantScope.addHook('preHandler', userProfileResolver);
  await tenantScope.register(userRoutes);
  await tenantScope.register(workspaceRoutes);
  await tenantScope.register(workspaceMemberRoutes);
  await tenantScope.register(invitationRoutes);
  await tenantScope.register(userManagementRoutes);
  await tenantScope.register(userProfileRoutes);
  await tenantScope.register(tenantSettingsRoutes);
  await tenantScope.register(auditLogRoutes);
  await tenantScope.register(pluginTenantRoutes);
});

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------
async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutdown signal received — closing server');
  await server.close();
  await stopDlqConsumer();
  await disconnectDatabase();
  await disconnectRedis();
  await disconnectKafka();
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
    // Start DLQ consumer (reads from Kafka DLQ topic → populates DB table)
    startDlqConsumer().catch((err) =>
      logger.error({ err }, 'DLQ consumer failed to start — DLQ management UI will be empty')
    );

    await server.listen({ port: config.PORT, host: '0.0.0.0' });
  } catch (err) {
    logger.error({ err }, 'Server failed to start');
    process.exit(1);
  }
}

void start();
