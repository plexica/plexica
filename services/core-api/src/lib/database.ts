// database.ts
// Prisma client singleton with connection lifecycle management.

import { PrismaClient } from '@prisma/client';

// Singleton pattern — reuse the same connection in dev to avoid
// connection pool exhaustion during hot reload.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: [
      { level: 'error', emit: 'stdout' },
      { level: 'warn', emit: 'stdout' },
    ],
  });

if (process.env['NODE_ENV'] !== 'production') {
  globalForPrisma.prisma = prisma;
}

// NOTE: Slow query logging via prisma.$on('query', ...) requires the PrismaClient
// to be typed with the full log generics (not the base PrismaClient type).
// This will be implemented properly in Phase 1 when query monitoring is set up.

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
