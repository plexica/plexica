// database.ts
// Prisma client singleton with connection lifecycle management.

import { PrismaClient } from '@prisma/client';

import { logger } from './logger.js';

// Singleton pattern — reuse the same connection in dev to avoid
// connection pool exhaustion during hot reload.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: [
      { level: 'query', emit: 'event' },
      { level: 'error', emit: 'log' },
      { level: 'warn', emit: 'log' },
    ],
  });

if (process.env['NODE_ENV'] !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Log slow queries (> 500ms) for performance monitoring
prisma.$on('query', (event) => {
  if (event.duration > 500) {
    logger.warn({ query: event.query, duration: event.duration }, 'Slow query detected');
  }
});

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
