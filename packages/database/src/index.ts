import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

export * from '@prisma/client';

// Singleton instance
let prisma: PrismaClient | undefined;
let pool: Pool | undefined;

export function getPrismaClient(): PrismaClient {
  if (!prisma) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL environment variable is not set');
    }

    // Parse connection string to extract components
    // This fixes issues with password parsing in pg Pool
    const url = new URL(databaseUrl);

    // Create PostgreSQL connection pool with explicit configuration
    pool = new Pool({
      host: url.hostname,
      port: parseInt(url.port || '5432', 10),
      database: url.pathname.split('/')[1]?.split('?')[0],
      user: url.username,
      password: url.password || '', // Ensure password is always a string
      ssl: url.searchParams.get('sslmode') === 'require' ? { rejectUnauthorized: false } : false,
      max: parseInt(process.env.DB_POOL_MAX || '50', 10), // Default 50 connections (pg default is 10)
      idleTimeoutMillis: 30000, // Close idle connections after 30s
    });

    // Create Prisma adapter for node-postgres
    const adapter = new PrismaPg(pool);

    // Create Prisma Client with adapter
    prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
      adapter,
      transactionOptions: {
        maxWait: 10000, // Max time to wait for a transaction slot (default 2000ms)
        timeout: 15000, // Max transaction duration (default 5000ms)
      },
    });
  }
  return prisma;
}

export default getPrismaClient();
