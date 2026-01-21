import prisma from '@plexica/database';
import type { PrismaClient } from '@plexica/database';

// Export the pre-configured Prisma Client from @plexica/database
// This includes the pg adapter for Prisma 7 compatibility
export const db: PrismaClient = prisma;

// Graceful shutdown
process.on('beforeExit', async () => {
  await db.$disconnect();
});
