/**
 * Test Application Builder
 *
 * Creates a Fastify app instance for testing without starting the server.
 * This is used by integration and E2E tests.
 */

import fastify, { FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import { config } from './config/index.js';
import { healthRoutes } from './routes/health.js';
import { tenantRoutes } from './routes/tenant.js';
import { authRoutes } from './routes/auth.js';
import { pluginRoutes } from './routes/plugin.js';
import { pluginUploadRoutes } from './routes/plugin-upload.js';
import { workspaceRoutes } from './routes/workspace.js';
import { workspaceTemplatesRoutes } from './routes/workspace-templates.js';
import { adminRoutes } from './routes/admin.js';
import { marketplaceRoutes } from './routes/marketplace.js';
import { pluginGatewayRoutes } from './routes/plugin-gateway.js';
import { translationRoutes } from './modules/i18n/i18n.controller.js';
import { storageRoutes } from './modules/storage/storage.routes.js';
import { notificationRoutes } from './modules/notifications/notification.routes.js';
import { jobsRoutes } from './modules/jobs/jobs.routes.js';
import { searchRoutes } from './modules/search/search.routes.js';
import { tenantContextMiddleware } from './middleware/tenant-context.js';
import { authorizationRoutes } from './routes/authorization.js';
import { policiesRoutes } from './routes/policies.js';
import { pluginV1Routes } from './routes/plugin-v1.js';
import { tenantPluginsV1Routes } from './routes/tenant-plugins-v1.js';
import { tenantAdminRoutes } from './routes/tenant-admin.js';
import metricsRoutes from './routes/metrics.js'; // Spec 012 T012-16 — Prometheus metrics endpoint
import { observabilityRoutes } from './routes/observability-v1.js'; // Spec 012 T012-26 — Plugin Observability API
import { layoutConfigRoutes } from './routes/layout-config.js'; // Spec 014 T014-14 — Layout Engine API
import { extensionRegistryRoutes } from './modules/extension-registry/index.js'; // Spec 013 T013-09 — Extension Registry API
import { db } from './lib/db.js';
import { redis } from './lib/redis.js';
import { ServiceRegistryService } from './services/service-registry.service.js';
import { PluginApiGateway } from './services/plugin-api-gateway.service.js';
import { SharedDataService } from './services/shared-data.service.js';
import { DependencyResolutionService } from './services/dependency-resolution.service.js';
import { setupErrorHandler } from './middleware/error-handler.js';

export async function buildTestApp(): Promise<FastifyInstance> {
  const app = fastify({
    logger: false, // Disable logging in tests
    requestTimeout: 30 * 1000,
    // Disable schema validation for responses to avoid serialization errors with custom error classes
    schemaErrorFormatter: (errors, _dataVar) => {
      console.log('[schemaErrorFormatter] Validation errors:', errors);
      return new Error(`Schema validation failed: ${JSON.stringify(errors)}`);
    },
  });

  // Security
  await app.register(helmet, {
    contentSecurityPolicy: false, // Disable CSP in tests
    // SECURITY: Always deny framing regardless of environment (TD-007).
    // X-Frame-Options: DENY is set unconditionally to match production behaviour.
    frameguard: { action: 'deny' },
    hsts: false,
  });

  // CORS
  // exposedHeaders mirrors production config so tests catch CORS regressions.
  await app.register(cors, {
    origin: config.corsOrigins,
    credentials: true,
    exposedHeaders: ['X-Translation-Hash', 'ETag', 'Cache-Control'],
  });

  // Rate limiting - very relaxed for tests (allow high concurrency)
  await app.register(rateLimit, {
    max: 10000, // Much higher limit for tests
    timeWindow: '1 minute',
    redis, // Use Redis for distributed rate limiting
    nameSpace: 'test-rate-limit:',
  });

  // Multipart support
  await app.register(multipart, {
    limits: {
      fileSize: 50 * 1024 * 1024,
    },
  });

  // SECURITY: Register advanced rate limiting middleware (multi-level)
  // DISABLED in tests to allow high-volume test execution
  // app.addHook('preHandler', advancedRateLimitMiddleware);

  // SECURITY: Register CSRF protection middleware globally
  // DISABLED in tests - tests use Bearer authentication which bypasses CSRF anyway
  // app.addHook('preHandler', csrfProtectionMiddleware);

  // Register routes
  await app.register(healthRoutes, { prefix: '/health' });
  await app.register(authRoutes, { prefix: '/api' });
  await app.register(tenantRoutes, { prefix: '/api' });
  await app.register(workspaceRoutes, { prefix: '/api' });
  await app.register(workspaceTemplatesRoutes, { prefix: '/api' }); // Spec 011 Phase 2 — FR-021, FR-022
  await app.register(pluginRoutes, { prefix: '/api' });
  await app.register(pluginUploadRoutes, { prefix: '/api' });
  await app.register(marketplaceRoutes, { prefix: '/api' });
  await app.register(adminRoutes, { prefix: '/api' });
  await app.register(translationRoutes, { prefix: '/api/v1' });
  await app.register(pluginV1Routes, { prefix: '/api/v1' }); // Spec 004 T004-09/T004-11
  await app.register(tenantPluginsV1Routes, { prefix: '/api/v1' }); // Spec 004 T004-10
  await app.register(authorizationRoutes, { prefix: '/api' }); // Authorization routes (Spec 003 RBAC)
  await app.register(policiesRoutes, { prefix: '/api' }); // ABAC policy routes (Spec 003)
  await app.register(tenantAdminRoutes, { prefix: '/api/v1' }); // Spec 008 — Tenant Admin Interface
  await app.register(metricsRoutes, { prefix: '/metrics' }); // Spec 012 T012-16 — Prometheus metrics endpoint (scrape target)
  await app.register(metricsRoutes, { prefix: '/api/metrics' }); // Spec 012 T012-16 — legacy /api/metrics/events path
  await app.register(observabilityRoutes, { prefix: '/api/v1/observability' }); // Spec 012 T012-26 — Plugin Observability API
  await app.register(layoutConfigRoutes, { prefix: '/api/v1' }); // Spec 014 T014-14 — Layout Engine API
  await app.register(extensionRegistryRoutes, { prefix: '/api/v1' }); // Spec 013 T013-09 — Extension Registry API

  // Spec 007 Core Services routes — registered with tenantContextMiddleware
  // so that getTenantId() can read request.tenant.tenantId
  await app.register(
    async (instance) => {
      instance.addHook('preHandler', tenantContextMiddleware);
      await instance.register(storageRoutes);
      await instance.register(notificationRoutes);
      await instance.register(jobsRoutes);
      await instance.register(searchRoutes);
    },
    { prefix: '/api/v1' }
  );

  // Plugin Gateway Routes
  const serviceRegistry = new ServiceRegistryService(db, redis, app.log);
  const apiGateway = new PluginApiGateway(serviceRegistry, app.log);
  const sharedData = new SharedDataService(db, redis, app.log);
  const dependencyResolver = new DependencyResolutionService(db, app.log);

  await pluginGatewayRoutes(app, serviceRegistry, apiGateway, sharedData, dependencyResolver);

  // Error handler
  setupErrorHandler(app);

  // Not found handler
  // SECURITY: detect path-traversal attempts whose ".." sequences were resolved
  // by URL normalisation (e.g. inject() or HTTP stack) before reaching the
  // router.  A request such as /api/v1/storage/signed-url/../../../etc/passwd
  // normalises to /api/etc/passwd which matches no route and lands here.
  // Returning 400 instead of 404 prevents information leakage and aligns with
  // the handler-level traversal checks in storage.routes.ts.
  const SYSTEM_PATH_SEGMENTS = new Set([
    'etc',
    'proc',
    'sys',
    'var',
    'tmp',
    'root',
    'home',
    'windows',
    'boot',
    'dev',
    'usr',
    'bin',
    'sbin',
    'lib',
    'opt',
    'mnt',
    'srv',
    'run',
    'snap',
  ]);
  app.setNotFoundHandler((request, reply) => {
    const segments = request.url.split('/').filter(Boolean);
    if (segments.some((s) => SYSTEM_PATH_SEGMENTS.has(s.split('?')[0].toLowerCase()))) {
      return reply.status(400).send({
        error: { code: 'PATH_TRAVERSAL', message: 'Path traversal detected' },
      });
    }
    return reply.status(404).send({
      error: 'Not Found',
      message: `Route ${request.method}:${request.url} not found`,
      statusCode: 404,
    });
  });

  return app;
}
