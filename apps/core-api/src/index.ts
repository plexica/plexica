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
import { adminRoutes } from './routes/admin';
// import { dlqRoutes } from './routes/dlq';
// import metricsRoutes from './routes/metrics';
import { pluginGatewayRoutes } from './routes/plugin-gateway';
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
    // SECURITY: Prevent SSL stripping attacks
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true,
    },
  });

  // CORS
  // SECURITY: Origins are now validated by cors-validator.ts
  await server.register(cors, {
    origin: config.corsOrigins,
    credentials: true,
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
          { name: 'auth', description: 'Authentication & authorization' },
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
  await server.register(pluginRoutes, { prefix: '/api' });
  await server.register(pluginUploadRoutes, { prefix: '/api' });
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
}

// Error handler
// SECURITY: Sanitize error messages to prevent information disclosure
setupErrorHandler(server);

// Not found handler
server.setNotFoundHandler((request, reply) => {
  reply.status(404).send({
    error: 'Not Found',
    message: `Route ${request.method}:${request.url} not found`,
    statusCode: 404,
  });
});

// Graceful shutdown
async function closeGracefully(signal: string) {
  server.log.info(`Received signal ${signal}, closing gracefully`);
  await server.close();
  process.exit(0);
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
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

start();
