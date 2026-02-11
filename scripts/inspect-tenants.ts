import { config } from 'dotenv';
import { resolve } from 'path';

// Load test env so Prisma connects to the test database
config({ path: resolve(process.cwd(), 'apps/core-api/.env.test') });

import prisma from '@plexica/database';

async function main() {
  console.log('Using DATABASE_URL:', process.env.DATABASE_URL);

  const tenants = await prisma.tenant.findMany({
    select: { id: true, slug: true, status: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  console.log(`Found ${tenants.length} tenants (showing up to 50):`);
  for (const t of tenants) {
    console.log(`- id=${t.id} slug=${t.slug} status=${t.status} createdAt=${t.createdAt}`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Error inspecting tenants:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
