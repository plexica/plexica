import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

export * from '@prisma/client';

// Singleton instance
let prisma: PrismaClient | undefined;
let pool: Pool | undefined;

export function getPrismaClient(): PrismaClient {
  if (!prisma) {
    // Create PostgreSQL connection pool
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });

    // Create Prisma adapter for node-postgres
    const adapter = new PrismaPg(pool);

    // Create Prisma Client with adapter
    prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
      adapter,
    });
  }
  return prisma;
}

export default getPrismaClient();
