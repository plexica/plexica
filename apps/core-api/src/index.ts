import fastify from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { config } from './config';
import { healthRoutes } from './routes/health';
import { tenantRoutes } from './routes/tenant';
import { authRoutes } from './routes/auth';
import { pluginRoutes } from './routes/plugin';
import { workspaceRoutes } from './routes/workspace';
import { dlqRoutes } from './routes/dlq';
import metricsRoutes from './routes/metrics';

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
});

// Register plugins
async function registerPlugins() {
  // Security
  await server.register(helmet, {
    contentSecurityPolicy: config.nodeEnv === 'production',
  });

  // CORS
  await server.register(cors, {
    origin: config.corsOrigin.split(','),
    credentials: true,
  });

  // Rate limiting
  // Increased for local development to prevent issues during testing
  await server.register(rateLimit, {
    max: 1000, // Increased from 100 to 1000 for local dev
    timeWindow: '1 minute',
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
        consumes: ['application/json'],
        produces: ['application/json'],
        tags: [
          { name: 'health', description: 'Health check endpoints' },
          { name: 'tenants', description: 'Tenant management' },
          { name: 'workspaces', description: 'Workspace management' },
          { name: 'plugins', description: 'Plugin management' },
          { name: 'auth', description: 'Authentication & authorization' },
          { name: 'dlq', description: 'Dead Letter Queue management' },
          { name: 'metrics', description: 'Event system metrics' },
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
}

// Register routes
async function registerRoutes() {
  await server.register(healthRoutes, { prefix: '/health' });
  await server.register(authRoutes, { prefix: '/api' });
  await server.register(tenantRoutes, { prefix: '/api' });
  await server.register(workspaceRoutes, { prefix: '/api' });
  await server.register(pluginRoutes, { prefix: '/api' });
  await server.register(dlqRoutes, { prefix: '/api/admin/dlq' });
  await server.register(metricsRoutes, { prefix: '/api/metrics' });
}

// Error handler
server.setErrorHandler((error, _request, reply) => {
  server.log.error(error);

  const statusCode = (error as any).statusCode || 500;
  const name = error instanceof Error ? error.name : 'Error';
  const message = error instanceof Error ? error.message : 'Unknown error';

  reply.status(statusCode).send({
    error: name,
    message: message,
    statusCode: statusCode,
  });
});

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
