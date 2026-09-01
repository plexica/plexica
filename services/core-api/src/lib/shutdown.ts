// lib/shutdown.ts
// Graceful shutdown for the Fastify server: closes the HTTP server, stops
// background services, and guarantees process.exit is reached. Invoked as
// `void shutdown(...)`, so a rejection here would leave the process alive and
// dependent on the event loop draining on its own.

import { stopBackgroundServices } from '../bootstrap.js';

import { logger } from './logger.js';

export function registerShutdownHandlers(closeServer: () => Promise<void>): void {
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
      await closeServer();
      await stopBackgroundServices();
      logger.info('Server closed gracefully');
    } catch (err) {
      exitCode = 1;
      logger.error({ err, signal }, 'Graceful shutdown failed — exiting anyway');
    } finally {
      process.exit(exitCode);
    }
  }

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}