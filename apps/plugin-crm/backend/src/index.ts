/**
 * CRM Plugin Backend Server (M2.3 Task 10)
 *
 * Standalone server for the CRM plugin that exposes
 * contacts and deals APIs for other plugins to consume
 */

import Fastify from 'fastify';
import { ContactsService } from './services/contacts.service.js';
import { DealsService } from './services/deals.service.js';
import { contactsRoutes } from './routes/contacts.routes.js';
import { dealsRoutes } from './routes/deals.routes.js';

const PORT = parseInt(process.env.PORT || '3100', 10);
const HOST = process.env.HOST || '0.0.0.0';

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

  // Initialize services
  const contactsService = new ContactsService();
  const dealsService = new DealsService(contactsService);

  // Health check
  fastify.get('/health', async () => {
    return {
      status: 'ok',
      plugin: 'crm',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      services: {
        contacts: contactsService.count(),
        deals: dealsService.count(),
      },
    };
  });

  // Plugin info
  fastify.get('/info', async () => {
    return {
      id: 'plugin-crm',
      name: 'CRM Plugin',
      version: '1.0.0',
      services: [
        {
          name: 'crm.contacts',
          version: '1.0.0',
          endpoints: [
            { method: 'GET', path: '/contacts' },
            { method: 'GET', path: '/contacts/:id' },
            { method: 'POST', path: '/contacts' },
            { method: 'PUT', path: '/contacts/:id' },
            { method: 'DELETE', path: '/contacts/:id' },
          ],
        },
        {
          name: 'crm.deals',
          version: '1.0.0',
          endpoints: [
            { method: 'GET', path: '/deals' },
            { method: 'GET', path: '/deals/:id' },
            { method: 'POST', path: '/deals' },
            { method: 'PUT', path: '/deals/:id' },
            { method: 'DELETE', path: '/deals/:id' },
          ],
        },
      ],
    };
  });

  // Register routes
  await contactsRoutes(fastify, contactsService);
  await dealsRoutes(fastify, dealsService);

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
    console.log(`🚀 CRM Plugin Backend Server Started`);
    console.log('='.repeat(80));
    console.log(`📍 URL: http://${HOST}:${PORT}`);
    console.log(`💚 Health: http://${HOST}:${PORT}/health`);
    console.log(`📋 Contacts: ${contactsService.count()} sample records`);
    console.log(`💼 Deals: ${dealsService.count()} sample records`);
    console.log('');
    console.log('API Endpoints:');
    console.log(`  GET    /contacts           - List all contacts`);
    console.log(`  GET    /contacts/:id       - Get contact by ID`);
    console.log(`  POST   /contacts           - Create contact`);
    console.log(`  PUT    /contacts/:id       - Update contact`);
    console.log(`  DELETE /contacts/:id       - Delete contact`);
    console.log(``);
    console.log(`  GET    /deals              - List all deals`);
    console.log(`  GET    /deals/:id          - Get deal by ID`);
    console.log(`  POST   /deals              - Create deal`);
    console.log(`  PUT    /deals/:id          - Update deal`);
    console.log(`  DELETE /deals/:id          - Delete deal`);
    console.log(`  GET    /deals/pipeline/summary - Pipeline statistics`);
    console.log('='.repeat(80));
    console.log('');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

main();
