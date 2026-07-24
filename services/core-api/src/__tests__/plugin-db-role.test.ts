import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '../lib/database.js';
import {
  createPluginRole,
  dropPluginRole,
  grantCreateOnSchema,
  revokeCreateOnSchema,
} from '../modules/plugin/services/db-role.service.js';

import { cleanupTenant, seedTenant } from './helpers/db.helpers.js';
import { isDbReachable } from './helpers/server.helpers.js';

const TENANT_SLUG = 'plugin-role-test';
const INSTALL_ID = '55000000-0000-4000-8000-000000000005';
const ROLE_NAME = 'plugin_55000000_0000_4000_8000_000000000005';
const SCHEMA_NAME = 'tenant_plugin_role_test';
const skipIfNoDb = it.skipIf(!(await isDbReachable()));

beforeAll(async () => {
  await seedTenant(TENANT_SLUG);
  await dropPluginRole(INSTALL_ID, TENANT_SLUG);
});

afterAll(async () => {
  await dropPluginRole(INSTALL_ID, TENANT_SLUG);
  await cleanupTenant(TENANT_SLUG);
  await prisma.$disconnect();
});

describe('plugin database role privileges', () => {
  skipIfNoDb('removes effective schema CREATE before runtime startup', async () => {
    await createPluginRole(INSTALL_ID, TENANT_SLUG, []);
    await grantCreateOnSchema(INSTALL_ID, TENANT_SLUG);

    const before = await prisma.$queryRawUnsafe<Array<{ hasCreate: boolean }>>(
      `SELECT has_schema_privilege($1, $2, 'CREATE') AS "hasCreate"`,
      ROLE_NAME,
      SCHEMA_NAME,
    );
    expect(before[0]?.hasCreate).toBe(true);

    await revokeCreateOnSchema(INSTALL_ID, TENANT_SLUG);
    const after = await prisma.$queryRawUnsafe<Array<{ hasCreate: boolean }>>(
      `SELECT has_schema_privilege($1, $2, 'CREATE') AS "hasCreate"`,
      ROLE_NAME,
      SCHEMA_NAME,
    );
    expect(after[0]?.hasCreate).toBe(false);
  });
});
