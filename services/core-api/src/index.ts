// index.ts
// Fastify server bootstrap — entry point for core-api.
// Registers plugins and starts the HTTP server.

import Fastify from 'fastify';

import { config } from './lib/config.js';
import { disconnectDatabase } from './lib/database.js';
import { logger } from './lib/logger.js';

const server = Fastify({
  // Use the project-level Pino logger (pino-pretty in dev, JSON in prod)
  loggerInstance: logger,
});

// ---------------------------------------------------------------------------
// Health check — public endpoint, no auth required (Constitution: explicit opt-in)
// ---------------------------------------------------------------------------
server.get('/health', async (_request, _reply) => {
  return { status: 'ok', version: '2.0.0' };
});

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------
async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutdown signal received — closing server');
  await server.close();
  await disconnectDatabase();
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
    await server.listen({ port: config.PORT, host: '0.0.0.0' });
  } catch (err) {
    logger.error({ err }, 'Server failed to start');
    process.exit(1);
  }
}

void start();
