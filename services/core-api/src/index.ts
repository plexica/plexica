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
import { connectRedis, startBackgroundServices } from './bootstrap.js';
import {
  GLOBAL_RATE_LIMIT,
  rateLimitKey,
  rateLimitErrorResponseBuilder,
} from './lib/rate-limit-config.js';
import { registerShutdownHandlers } from './lib/shutdown.js';
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
  pluginDevRoutes,
} from './modules/plugin/index.js';
import { adminRoutes } from './modules/admin/index.js';
import { basicHealthRoutes } from './modules/health/basic-health-routes.js';
import { pluginEventAuth } from './middleware/plugin-event-auth.js';

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
// keyGenerator: library default (request.ip) — request.user is not yet
// populated at plugin level. Per-user keying is applied via hook:'preHandler'
// on individual routes/scopes (e.g. the admin scope below, POST
// /api/admin/tenants/migrate-all in tenant-routes.ts).
// Fails open when Redis is unavailable (ADR-012).
// ---------------------------------------------------------------------------
await server.register(rateLimit, {
  global: true,
  max: GLOBAL_RATE_LIMIT.max,
  timeWindow: GLOBAL_RATE_LIMIT.timeWindow,
  redis,
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
// Public routes — no auth required (Constitution: explicit opt-in).
// basicHealthRoutes registers GET /health AND its /api-namespaced twin
// GET /api/v1/health on the root instance — OUTSIDE every requireAuth
// preHandler scope — so the same-origin /api/* proxy can reach it (CI contract).
// ---------------------------------------------------------------------------
await server.register(basicHealthRoutes);

// Tenant resolve is public (registered inside tenantRoutes, no auth hook here)
await server.register(tenantRoutes);

// Public invitation accept endpoint — tenant context required but no auth
await server.register(invitationPublicRoutes);

// Super admin plugin management routes — auth-only scope (no tenant context).
// Also hosts the new admin module (/api/v1/admin/* — Spec 005) which applies
// requireSuperAdmin per route group inside the module plugin itself.
//
// Scoped @fastify/rate-limit registration (the plugin is fp-wrapped, so this
// adds a second onRoute hook firing only for routes registered inside this
// scope): admin routes get BOTH the global IP-keyed limit (onRequest) and
// this stricter user-keyed limit. hook:'preHandler' places the check after
// authMiddleware (scope-level hooks run before route-level preHandler arrays),
// so request.user is populated when rateLimitKey runs.
// Redis-backed: the limit is exact across N replicas — the in-memory limiter
// it replaces was per-process (effective limit N × max). Trade-off (ADR-012,
// fail-open): with Redis down, admin endpoints lose this throttling.
await server.register(async (adminScope) => {
  adminScope.addHook('preHandler', authMiddleware);
  await adminScope.register(rateLimit, {
    global: true,
    max: config.ADMIN_RATE_LIMIT_MAX,
    timeWindow: '1 minute',
    hook: 'preHandler',
    keyGenerator: rateLimitKey,
    redis,
    errorResponseBuilder: rateLimitErrorResponseBuilder,
  });
  await adminScope.register(pluginAdminRoutes);
  await adminScope.register(adminRoutes);
});

// Plugin event-emission route — dual-auth scope. Plugin backends use an
// X-Plugin-Service-Token (no JWT); user-initiated emissions use a Bearer JWT.
// Registered OUTSIDE the tenantScope because authMiddleware would reject
// service-token requests (no Authorization header) with 401 before the
// handler runs. pluginEventAuth handles both paths.
// Rate limiting is per-route on POST /api/v1/events/emit (100 req/min,
// Redis-backed — see events.routes.ts).
await server.register(async (eventScope) => {
  eventScope.addHook('preHandler', pluginEventAuth);
  await eventScope.register(pluginEventRoutes);
});

// Dev-mode plugin registration — outside tenantScope: dev backends have no
// user JWT (see middleware/dev-route-auth.ts and pluginDevRoutes).
await server.register(pluginDevRoutes);

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
// Graceful shutdown — SIGINT/SIGTERM handlers in lib/shutdown.ts (Rule 4).
// ---------------------------------------------------------------------------
registerShutdownHandlers(() => server.close());

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
