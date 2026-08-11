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
import { logger } from './lib/logger.js';
import { redis } from './lib/redis.js';
import { connectRedis, startBackgroundServices, stopBackgroundServices } from './bootstrap.js';
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
import {
  pluginAdminRoutes,
  pluginTenantRoutes,
  pluginEventRoutes,
} from './modules/plugin/index.js';
import { adminRoutes } from './modules/admin/index.js';
import { pluginEventAuth } from './middleware/plugin-event-auth.js';
import { rateLimit as rateLimitMiddleware } from './middleware/rate-limit.js';

const server = Fastify({ loggerInstance: logger, trustProxy: config.TRUST_PROXY });

// Error handler — applied directly to root instance so it covers all scopes.
// Do NOT use server.register(configureErrorHandler) — that would scope the
// handler to a child plugin context, leaving sibling routes unprotected.
configureErrorHandler(server);

// Redis must be connected before the rate-limit plugin below is registered
// with the same client. Never throws — see bootstrap.ts.
await connectRedis();

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
// Multipart support — required for file uploads (logo, avatar). Must be
// registered before routes calling request.isMultipart(). Rate limiting comes
// from the global @fastify/rate-limit plugin registered above; CodeQL cannot
// trace through Fastify's plugin architecture, hence the suppression below.
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
  adminScope.addHook('preHandler', rateLimitMiddleware(config.ADMIN_RATE_LIMIT_MAX, 60000));
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
let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  // A second signal (or SIGINT after SIGTERM) must not run the teardown twice.
  if (shuttingDown) {
    logger.warn({ signal }, 'Shutdown already in progress — signal ignored');
    return;
  }
  shuttingDown = true;

  logger.info({ signal }, 'Shutdown signal received — closing server');
  let exitCode = 0;
  try {
    await server.close();
    await stopBackgroundServices();
    logger.info('Server closed gracefully');
  } catch (err) {
    // try/finally guarantees process.exit is reached: shutdown() is invoked as
    // `void shutdown(...)`, so a rejection here would leave the process alive
    // and dependent on the event loop draining on its own.
    exitCode = 1;
    logger.error({ err, signal }, 'Graceful shutdown failed — exiting anyway');
  } finally {
    process.exit(exitCode);
  }
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
async function start(): Promise<void> {
  try {
    await startBackgroundServices();
    await server.listen({ port: config.PORT, host: '0.0.0.0' });
  } catch (err) {
    logger.error({ err }, 'Server failed to start');
    process.exit(1);
  }
}

void start();
