/**
 * Analytics Plugin Backend Server (M2.3 Task 10)
 *
 * This server demonstrates PLUGIN-TO-PLUGIN COMMUNICATION
 * by calling the CRM plugin APIs to generate analytics reports.
 *
 * This is the key demonstration of M2.3!
 */

import Fastify from 'fastify';
import { AnalyticsService } from './services/analytics.service.js';
import { analyticsRoutes } from './routes/analytics.routes.js';

const PORT = parseInt(process.env.PORT || '3200', 10);
const HOST = process.env.HOST || '0.0.0.0';
const CRM_BASE_URL = process.env.CRM_BASE_URL || 'http://localhost:3100';

async function main() {
  // Create Fastify instance
  const fastify = Fastify({
    logger: {
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
        },
      },
    },
  });

  // Initialize service with CRM connection
  const analyticsService = new AnalyticsService(CRM_BASE_URL);

  // Health check
  fastify.get('/health', async () => {
    return {
      status: 'ok',
      plugin: 'analytics',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      dependencies: {
        crm: CRM_BASE_URL,
      },
      reports: analyticsService.list().length,
    };
  });

  // Plugin info
  fastify.get('/info', async () => {
    return {
      id: 'plugin-analytics',
      name: 'Analytics Plugin',
      version: '1.0.0',
      dependencies: [
        {
          pluginId: 'plugin-crm',
          services: ['crm.contacts', 'crm.deals'],
          version: '^1.0.0',
          reason: 'Fetches contact and deal data for analytics',
        },
      ],
      services: [
        {
          name: 'analytics.reports',
          version: '1.0.0',
          endpoints: [
            { method: 'GET', path: '/reports' },
            { method: 'GET', path: '/reports/:id' },
            { method: 'POST', path: '/reports/:id/run' },
          ],
        },
      ],
    };
  });

  // Register routes
  await analyticsRoutes(fastify, analyticsService);

  // Error handler
  fastify.setErrorHandler((error, request, reply) => {
    fastify.log.error(error);
    reply.status(500).send({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  });

  // Start server
  try {
    await fastify.listen({ port: PORT, host: HOST });
    console.log('');
    console.log('='.repeat(80));
    console.log(`📊 Analytics Plugin Backend Server Started`);
    console.log('='.repeat(80));
    console.log(`📍 URL: http://${HOST}:${PORT}`);
    console.log(`💚 Health: http://${HOST}:${PORT}/health`);
    console.log(`🔗 CRM Dependency: ${CRM_BASE_URL}`);
    console.log(`📈 Reports: ${analyticsService.list().length} configured`);
    console.log('');
    console.log('🔥 PLUGIN-TO-PLUGIN COMMUNICATION ENABLED! 🔥');
    console.log('   This plugin calls CRM plugin APIs to generate reports');
    console.log('');
    console.log('API Endpoints:');
    console.log(`  GET    /reports           - List all reports`);
    console.log(`  GET    /reports/:id       - Get report details`);
    console.log(`  POST   /reports/:id/run   - Run report (calls CRM APIs!)`);
    console.log('');
    console.log('Try it:');
    console.log(`  curl http://localhost:${PORT}/reports`);
    console.log(`  curl -X POST http://localhost:${PORT}/reports/report-1/run`);
    console.log('='.repeat(80));
    console.log('');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

main();
