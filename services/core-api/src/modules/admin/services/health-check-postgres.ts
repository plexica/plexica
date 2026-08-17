// health-check-postgres.ts
// PostgreSQL health probe — executes `SELECT 1` via the shared Prisma client.
// Implements: Spec 005, Feature 005-09 (S5-100)

import { prisma } from '../../../lib/database.js';

import { makeProbe, withProbeTimeout } from './health-checker.service.js';

export const probePostgres = makeProbe('postgres', () =>
  withProbeTimeout(prisma.$queryRaw`SELECT 1`)
);
