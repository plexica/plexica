// check-db-connect.mjs
// Quick PostgreSQL connectivity check using Prisma client.
// Usage: DATABASE_URL=postgresql://user:pass@host:5432/db node scripts/check-db-connect.mjs
// Exits: 0 on success, 1 on auth failure, 2 on DB missing, 3 on other error

import { PrismaClient } from '../node_modules/@prisma/client/index.js';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL not set');
  process.exit(3);
}

const p = new PrismaClient({ datasources: { db: { url } } });

try {
  await p.$queryRaw`SELECT 1 AS ok`;
  console.log('OK');
  await p.$disconnect();
  process.exit(0);
} catch (e) {
  const msg = e.message ?? '';
  await p.$disconnect().catch(() => {});
  if (msg.includes('Authentication failed')) {
    console.log('AUTH_FAILED');
    process.exit(1);
  }
  if (msg.includes('does not exist')) {
    console.log('DB_MISSING');
    process.exit(2);
  }
  console.log('ERROR:' + msg.substring(0, 200));
  process.exit(3);
}
