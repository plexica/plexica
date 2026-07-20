// health-check-postgres.ts
// PostgreSQL health probe — executes `SELECT 1` via the shared Prisma client.
// Implements: Spec 005, Feature 005-09 (S5-100)

import { prisma } from '../../../lib/database.js';

import { buildServiceResult, withProbeTimeout } from './health-checker.service.js';

import type { HealthServiceResult } from '../schemas/health-schemas.js';

export async function probePostgres(): Promise<HealthServiceResult> {
  const name = 'postgres';
  const start = performance.now();

  try {
    await withProbeTimeout(prisma.$queryRaw`SELECT 1`);
    return buildServiceResult(name, Math.round(performance.now() - start), null);
  } catch (error) {
    return buildServiceResult(name, Math.round(performance.now() - start), error);
  }
}
