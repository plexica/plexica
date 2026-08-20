// tenant-db-cache-deprovisioning.test.ts
// The deletion-saga schema_drop wiring of the ADR-027 TenantPrismaClient
// cache (split from tenant-db-cache.test.ts to satisfy the 200-line rule).

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { prisma } from '../lib/database.js';
import {
  disconnectAllTenantDbClients,
  hasTenantDbClient,
} from '../lib/tenant-db-cache.js';
import { withTenantDb } from '../lib/tenant-database.js';
import { executeSchemaDrop } from '../modules/admin/services/deletion-step-schema-drop.js';

import { makeContext } from './helpers/tenant-db-cache.helpers.js';

const DROP_SCHEMA = 'tenant_cache_drop';

beforeAll(async () => {
  await disconnectAllTenantDbClients();
});

afterAll(async () => {
  await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${DROP_SCHEMA}" CASCADE`);
  await disconnectAllTenantDbClients();
});

describe('deprovisioning wiring', () => {
  it('the deletion saga schema_drop step invalidates the cached client', async () => {
    await prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${DROP_SCHEMA}"`);

    const db1 = await withTenantDb((db) => Promise.resolve(db), makeContext(DROP_SCHEMA));
    const disconnectSpy = vi.spyOn(db1, '$disconnect');

    await executeSchemaDrop(prisma, 'tenant-id-cache-drop', DROP_SCHEMA);

    expect(disconnectSpy).toHaveBeenCalledTimes(1);
    expect(hasTenantDbClient(DROP_SCHEMA)).toBe(false);
  });
});