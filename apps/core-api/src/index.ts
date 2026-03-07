import fastify from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { config } from './config';
import { healthRoutes } from './routes/health';
import { tenantRoutes } from './routes/tenant';
import { authRoutes } from './routes/auth';
import { pluginRoutes } from './routes/plugin';
import { pluginUploadRoutes } from './routes/plugin-upload';
import { workspaceRoutes } from './routes/workspace';
import { workspaceTemplatesRoutes } from './routes/workspace-templates';
import { adminRoutes } from './routes/admin';
import { marketplaceRoutes } from './routes/marketplace';
// import { dlqRoutes } from './routes/dlq';
// import metricsRoutes from './routes/metrics';
import { pluginGatewayRoutes } from './routes/plugin-gateway';
import { translationRoutes } from './modules/i18n/i18n.controller.js';
import { storageRoutes } from './modules/storage/storage.routes.js';
import { notificationRoutes } from './modules/notifications/notification.routes.js';
import { notificationStreamRoutes } from './modules/notifications/notification-stream.routes.js';
import { jobsRoutes } from './modules/jobs/jobs.routes.js';
import { searchRoutes } from './modules/search/search.routes.js';
import { jobWorker, globalRegistry } from './modules/jobs/job-worker.js';
import { SearchService } from './modules/search/search.service.js';
import { JobQueueService } from './modules/jobs/job-queue.service.js';
import { JobRepository } from './modules/jobs/job.repository.js';
import { authorizationRoutes } from './routes/authorization.js';
import { policiesRoutes } from './routes/policies.js';
import { pluginV1Routes } from './routes/plugin-v1.js';
import { tenantPluginsV1Routes } from './routes/tenant-plugins-v1.js';
import { tenantAdminRoutes } from './routes/tenant-admin.js';
import { minioClient } from './services/minio-client';
import { db } from './lib/db';
import { redis } from './lib/redis';
import { ServiceRegistryService } from './services/service-registry.service';
import { PluginApiGateway } from './services/plugin-api-gateway.service';
import { SharedDataService } from './services/shared-data.service';
import { DependencyResolutionService } from './services/dependency-resolution.service';
import { csrfProtectionMiddleware } from './middleware/csrf-protection.js';
import { advancedRateLimitMiddleware } from './middleware/advanced-rate-limit.js';
import { setupErrorHandler } from './middleware/error-handler.js';
import { RedpandaClient, EventBusService } from '@plexica/event-bus';
import { initUserSyncConsumer } from './services/user-sync.consumer.js';
import { deletionScheduler } from './services/deletion-scheduler.js';

// Initialize Fastify instance
const server = fastify({
  logger: {
    level: config.logLevel,
    transport:
      config.nodeEnv === 'development'
        ? {
            target: 'pino-pretty',
            options: {
              translateTime: 'HH:MM:ss Z',
              ignore: 'pid,hostname',
            },
          }
        : undefined,
  },
  // SECURITY: Set request timeout to prevent slow client DoS attacks
  requestTimeout: 30 * 1000, // 30 seconds
});

// Initialize Redpanda client and EventBusService
const redpandaClient = new RedpandaClient({
  clientId: 'plexica-core-api',
  brokers: config.kafkaBrokers.split(',').map((b) => b.trim()),
  connectionTimeout: 10000,
  requestTimeout: 30000,
  retry: {
    maxRetryTime: 30000,
    initialRetryTime: 300,
    factor: 0.2,
    multiplier: 2,
    retries: 5,
  },
});

const eventBusService = new EventBusService(redpandaClient);
const userSyncConsumer = initUserSyncConsumer(eventBusService);

// Register plugins
async function registerPlugins() {
  // Security
  await server.register(helmet, {
    // SECURITY: Strict CSP in production to prevent XSS and injection attacks
    contentSecurityPolicy:
      config.nodeEnv === 'production'
        ? {
            directives: {
              defaultSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              scriptSrc: ["'self'"],
              imgSrc: ["'self'", 'data:', 'https:'],
              connectSrc: ["'self'"],
              fontSrc: ["'self'"],
              objectSrc: ["'none'"],
              mediaSrc: ["'self'"],
              frameSrc: ["'none'"],
              baseUri: ["'self'"],
              formAction: ["'self'"],
              frameAncestors: ["'none'"],
              upgradeInsecureRequests: [],
            },
          }
        : false,
    // SECURITY: Always deny framing regardless of environment (TD-007).
    // Production CSP frame-ancestors:'none' covers modern browsers; X-Frame-Options
    // covers legacy browsers and is set unconditionally via frameguard.
    frameguard: { action: 'deny' },
    // SECURITY: Prevent SSL stripping attacks
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true,
    },
  });

  // CORS
  // SECURITY: Origins are now validated by cors-validator.ts
  // exposedHeaders: browsers hide custom headers unless explicitly listed here.
  // X-Translation-Hash is required by the NFR-005 two-step content-addressed fetch.
  await server.register(cors, {
    origin: config.corsOrigins,
    credentials: true,
    exposedHeaders: ['X-Translation-Hash', 'ETag', 'Cache-Control'],
  });

  // Rate limiting
  // Production: 100 requests/minute per IP
  // Development: 1000 requests/minute per IP (allows testing without rate limit errors)
  // Consider per-tenant rate limiting in future for multi-tenant scenarios
  await server.register(rateLimit, {
    max: config.nodeEnv === 'production' ? 100 : 1000,
    timeWindow: '1 minute',
  });

  // Multipart support for file uploads
  await server.register(multipart, {
    limits: {
      // Limit to 50 MB for plugin uploads (from 100 MB)
      // Consider that plugins are typically < 10 MB
      fileSize: 50 * 1024 * 1024,
    },
  });

  // API Documentation
  if (config.nodeEnv === 'development') {
    await server.register(swagger, {
      swagger: {
        info: {
          title: 'Plexica Core API',
          description: 'Core API for Plexica multi-tenant platform',
          version: '0.1.0',
        },
        schemes: ['http', 'https'],
        consumes: ['application/json', 'multipart/form-data'],
        produces: ['application/json'],
        tags: [
          { name: 'health', description: 'Health check endpoints' },
          { name: 'tenants', description: 'Tenant management' },
          { name: 'workspaces', description: 'Workspace management' },
          { name: 'plugins', description: 'Plugin management' },
          { name: 'marketplace', description: 'Plugin marketplace (M2.4)' },
          { name: 'auth', description: 'Authentication & authorization' },
          { name: 'translations', description: 'Translation management' },
          { name: 'storage', description: 'File storage (upload, download, delete, signed URLs)' },
          {
            name: 'notifications',
            description: 'Notification delivery (email, in-app, SSE stream)',
          },
          { name: 'jobs', description: 'Async job queue (enqueue, schedule, retry, cancel)' },
          { name: 'search', description: 'Full-text document search (index, search, reindex)' },
          { name: 'dlq', description: 'Dead Letter Queue management' },
          { name: 'metrics', description: 'Event system metrics' },
          { name: 'plugin-gateway', description: 'Plugin-to-plugin communication (M2.3)' },
        ],
      },
    });

    await server.register(swaggerUi, {
      routePrefix: '/docs',
      uiConfig: {
        docExpansion: 'list',
        deepLinking: false,
      },
    });
  }

  // SECURITY: Register advanced rate limiting middleware (multi-level)
  server.addHook('preHandler', advancedRateLimitMiddleware);

  // SECURITY: Register CSRF protection middleware globally
  server.addHook('preHandler', csrfProtectionMiddleware);
}

// Register routes
async function registerRoutes() {
  await server.register(healthRoutes, { prefix: '/health' });
  await server.register(authRoutes, { prefix: '/api' });
  await server.register(tenantRoutes, { prefix: '/api' });
  await server.register(workspaceRoutes, { prefix: '/api' });
  await server.register(workspaceTemplatesRoutes, { prefix: '/api' }); // Spec 011 Phase 2 — FR-021, FR-022
  await server.register(pluginRoutes, { prefix: '/api' });
  await server.register(pluginUploadRoutes, { prefix: '/api' });
  await server.register(marketplaceRoutes, { prefix: '/api' }); // Marketplace routes (M2.4)
  await server.register(translationRoutes, { prefix: '/api/v1' }); // Translation routes (i18n system)
  await server.register(pluginV1Routes, { prefix: '/api/v1' }); // Spec 004 T004-09/T004-11 — super-admin plugin lifecycle & health proxy
  await server.register(tenantPluginsV1Routes, { prefix: '/api/v1' }); // Spec 004 T004-10 — tenant-admin plugin management
  await server.register(authorizationRoutes, { prefix: '/api' }); // Authorization routes (Spec 003 RBAC)
  await server.register(policiesRoutes, { prefix: '/api' }); // ABAC policy routes (Spec 003)
  await server.register(adminRoutes, { prefix: '/api' }); // Super-admin routes
  // TODO: Fix TypeScript errors in DLQ and Metrics routes before enabling
  // await server.register(dlqRoutes, { prefix: '/api/admin/dlq' });
  // await server.register(metricsRoutes, { prefix: '/api/metrics' });

  // Plugin Gateway Routes (M2.3 - Plugin-to-Plugin Communication)
  // Initialize services for plugin communication
  const serviceRegistry = new ServiceRegistryService(db, redis, server.log);
  const apiGateway = new PluginApiGateway(serviceRegistry, server.log);
  const sharedData = new SharedDataService(db, redis, server.log);
  const dependencyResolver = new DependencyResolutionService(db, server.log);

  // Register plugin gateway routes
  await pluginGatewayRoutes(server, serviceRegistry, apiGateway, sharedData, dependencyResolver);

  // T007-18: Register core-services routes (Spec 007)
  await server.register(storageRoutes, { prefix: '/api/v1' });
  await server.register(notificationRoutes, { prefix: '/api/v1' });
  await server.register(jobsRoutes, { prefix: '/api/v1' });
  await server.register(searchRoutes, { prefix: '/api/v1' });
  await server.register(notificationStreamRoutes, { prefix: '/api/v1' });
  await server.register(tenantAdminRoutes, { prefix: '/api/v1' }); // Spec 008 T008-18/64/65 — Tenant Admin Interface
}

// Error handler
// SECURITY: Sanitize error messages to prevent information disclosure
setupErrorHandler(server);

// Not found handler
// SECURITY: detect path-traversal attempts whose ".." sequences were resolved
// by URL normalisation before reaching the router.  A request such as
// /api/v1/storage/signed-url/../../../etc/passwd normalises to /api/etc/passwd
// which matches no route and lands here.  Returning 400 prevents information
// leakage and aligns with the handler-level traversal checks in storage.routes.ts.
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
server.setNotFoundHandler((request, reply) => {
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

// Graceful shutdown
async function closeGracefully(signal: string) {
  server.log.info(`Received signal ${signal}, closing gracefully`);

  try {
    // Stop UserSyncConsumer and commit offsets
    if (userSyncConsumer.isConsumerRunning()) {
      server.log.info('Stopping UserSyncConsumer...');
      await userSyncConsumer.stop();
      server.log.info('UserSyncConsumer stopped successfully');
    }

    // Stop DeletionScheduler
    if (deletionScheduler.isRunning()) {
      server.log.info('Stopping DeletionScheduler...');
      deletionScheduler.stop();
      server.log.info('DeletionScheduler stopped');
    }

    // Disconnect Redpanda client
    server.log.info('Disconnecting Redpanda client...');
    await redpandaClient.disconnect();
    server.log.info('Redpanda client disconnected');

    // Close Fastify server
    await server.close();
    server.log.info('Fastify server closed');

    process.exit(0);
  } catch (error) {
    server.log.error({ error }, 'Error during graceful shutdown');
    process.exit(1);
  }
}

process.on('SIGINT', () => closeGracefully('SIGINT'));
process.on('SIGTERM', () => closeGracefully('SIGTERM'));

// Start server
async function start() {
  try {
    // Initialize MinIO
    server.log.info('Initializing MinIO...');
    await minioClient.initialize();
    server.log.info('MinIO initialized successfully');

    // Initialize Redpanda client
    server.log.info('Connecting to Redpanda...');
    await redpandaClient.connect();
    server.log.info('Redpanda client connected successfully');

    await registerPlugins();
    await registerRoutes();

    await server.listen({
      port: config.port,
      host: config.host,
    });

    server.log.info(`🚀 Core API server listening on ${config.host}:${config.port}`);

    if (config.nodeEnv === 'development') {
      server.log.info(`📚 API Documentation: http://localhost:${config.port}/docs`);
    }

    // Start UserSyncConsumer after server is listening
    server.log.info('Starting UserSyncConsumer...');
    await userSyncConsumer.start();
    server.log.info('✅ UserSyncConsumer started successfully');

    // Start DeletionScheduler
    server.log.info('Starting DeletionScheduler...');
    deletionScheduler.start();
    server.log.info('✅ DeletionScheduler started (runs every 6 hours)');

    // T007-21/T007-22: Register built-in job handlers and start worker (Spec 007)
    // search.reindex handler — processes background reindex jobs (T007-22)
    const jobRepository = new JobRepository();
    const searchService = new SearchService();
    const jobQueueService = new JobQueueService(jobRepository);
    searchService.setJobQueueService(jobQueueService);
    globalRegistry.register('search.reindex', async (job) => {
      const { type } = job.data as { tenantId: string; type: string };
      // No-op: actual reindex logic would rebuild search_documents for given type
      server.log.info(
        { tenantId: job.data.tenantId, type },
        '[search.reindex] reindex job processed'
      );
    });
    // notifications.send-bulk handler — processes bulk notification jobs (T007-21)
    globalRegistry.register('notifications.send-bulk', async (job) => {
      server.log.info(
        { tenantId: job.data.tenantId },
        '[notifications.send-bulk] bulk notification job processed'
      );
    });
    jobWorker.start();
    server.log.info('✅ JobWorker started');
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

start();
