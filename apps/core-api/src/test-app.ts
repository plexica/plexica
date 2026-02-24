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
import { authorizationRoutes } from './routes/authorization.js';
import { policiesRoutes } from './routes/policies.js';
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
    hsts: false,
  });

  // CORS
  await app.register(cors, {
    origin: config.corsOrigins,
    credentials: true,
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
  await app.register(authorizationRoutes, { prefix: '/api' }); // Authorization routes (Spec 003 RBAC)
  await app.register(policiesRoutes, { prefix: '/api' }); // ABAC policy routes (Spec 003)

  // Plugin Gateway Routes
  const serviceRegistry = new ServiceRegistryService(db, redis, app.log);
  const apiGateway = new PluginApiGateway(serviceRegistry, app.log);
  const sharedData = new SharedDataService(db, redis, app.log);
  const dependencyResolver = new DependencyResolutionService(db, app.log);

  await pluginGatewayRoutes(app, serviceRegistry, apiGateway, sharedData, dependencyResolver);

  // Error handler
  setupErrorHandler(app);

  // Not found handler
  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      error: 'Not Found',
      message: `Route ${request.method}:${request.url} not found`,
      statusCode: 404,
    });
  });

  return app;
}
