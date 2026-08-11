// user-management-remove-race.test.ts
// Integration test — INT-04 follow-up: the last-admin guard under concurrency.
// Two concurrent removals of the tenant's ONLY two admins must never both
// succeed: exactly one wins (204), the loser gets 409, and at least one
// active admin profile remains. Requires the real Keycloak — the admin set
// comes from the realm role-membership endpoint, so without a provisioned
// realm the guard fails open and there is nothing to assert.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { config } from '../lib/config.js';
import { prisma } from '../lib/database.js';
import { createRealm, deleteRealm } from '../lib/keycloak-admin.js';
import { createRealmUser } from '../lib/keycloak-admin-users.js';
import { userManagementRoutes } from '../modules/user-management/routes.js';

import {
  createTestServer,
  makeFullStub,
  isDbReachable,
  isKeycloakReachable,
} from './helpers/server.helpers.js';
import {
  buildTenantClientForCtx,
  cleanupTenant,
  seedTenant,
  seedUserProfile,
  wipeTenantUsers,
} from './helpers/db.helpers.js';

import type { FastifyInstance } from 'fastify';
import type { TenantContext } from '../lib/tenant-context-store.js';

const SLUG = 'ws-int04-userrace';
// Fixed internal UUIDs (audit_log.actor_id is UUID NOT NULL; route params are UUIDs)
const ACTOR_ID = '00000000-0104-00a1-0000-000000000001';
const ALICE_ID = '00000000-0104-00a2-0000-000000000001';
const BOB_ID = '00000000-0104-00a3-0000-000000000001';
const CAROL_ID = '00000000-0104-00a4-0000-000000000001';

const kcAvailable = await isKeycloakReachable();
const skipIfNoKc = it.skipIf(!(await isDbReachable()) || !kcAvailable);

let server: FastifyInstance;
let ctx: TenantContext;
let reqHeaders: Record<string, string>;
let kcAlice = '';
let kcBob = '';
let kcCarol = '';

// createRealmUser does not assign realm roles, and the role-mapping POST has
// no exported helper — the fixture issues it directly with an admin token.
async function assignTenantAdminRole(realm: string, keycloakUserId: string): Promise<void> {
  const tokenRes = await fetch(
    `${config.KEYCLOAK_URL}/realms/master/protocol/openid-connect/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'password',
        client_id: 'admin-cli',
        username: config.KEYCLOAK_ADMIN_USER,
        password: config.KEYCLOAK_ADMIN_PASSWORD,
      }).toString(),
    }
  );
  const { access_token: token } = (await tokenRes.json()) as { access_token: string };
  const roleRes = await fetch(`${config.KEYCLOAK_URL}/admin/realms/${realm}/roles/tenant_admin`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const role = (await roleRes.json()) as { id: string; name: string };
  const assignRes = await fetch(
    `${config.KEYCLOAK_URL}/admin/realms/${realm}/users/${keycloakUserId}/role-mappings/realm`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([{ id: role.id, name: role.name }]),
    }
  );
  if (!assignRes.ok) throw new Error(`tenant_admin role assignment failed: ${assignRes.status}`);
}

beforeAll(async () => {
  const { tenantContext } = await seedTenant(SLUG);
  ctx = tenantContext;

  if (kcAvailable) {
    // Clean slate first: a crashed previous run may have left the realm with
    // stale users, which would make createRealmUser conflict below.
    await deleteRealm(ctx.realmName).catch(() => {});
    await createRealm({
      realmName: ctx.realmName,
      adminEmail: `root@${SLUG}.test.io`,
      tenantSlug: SLUG,
    });
    kcAlice = (await createRealmUser(ctx.realmName, `alice@${SLUG}.test.io`, 'Alice Race')).userId;
    kcBob = (await createRealmUser(ctx.realmName, `bob@${SLUG}.test.io`, 'Bob Race')).userId;
    kcCarol = (await createRealmUser(ctx.realmName, `carol@${SLUG}.test.io`, 'Carol Race')).userId;
    await assignTenantAdminRole(ctx.realmName, kcAlice);
    await assignTenantAdminRole(ctx.realmName, kcBob);
  }

  server = await createTestServer();
  server.addHook('preHandler', makeFullStub(ACTOR_ID, ctx, ['tenant_admin']));
  await server.register(userManagementRoutes);
  await server.ready();

  reqHeaders = { 'x-tenant-slug': SLUG };
});

afterAll(async () => {
  await server?.close();
  if (kcAvailable && ctx) await deleteRealm(ctx.realmName).catch(() => {});
  await cleanupTenant(SLUG);
  await prisma.$disconnect();
});

beforeEach(async () => {
  await wipeTenantUsers(ctx);
  await seedUserProfile(ctx, ACTOR_ID, `actor@${SLUG}.test.io`, 'Actor Race', ACTOR_ID);
  await seedUserProfile(ctx, kcAlice, `alice@${SLUG}.test.io`, 'Alice Race', ALICE_ID);
  await seedUserProfile(ctx, kcBob, `bob@${SLUG}.test.io`, 'Bob Race', BOB_ID);
  await seedUserProfile(ctx, kcCarol, `carol@${SLUG}.test.io`, 'Carol Race', CAROL_ID);
});

async function countActiveAdminProfiles(): Promise<number> {
  const db = buildTenantClientForCtx(ctx);
  try {
    return await db.userProfile.count({
      where: { keycloakUserId: { in: [kcAlice, kcBob] }, status: 'active', deletedAt: null },
    });
  } finally {
    await db.$disconnect();
  }
}

describe('INT-04 Remove user — last-admin guard with a live realm', () => {
  skipIfNoKc('DELETE on a non-admin member → 204 (guard evaluates and does not fire)', async () => {
    const res = await server.inject({
      method: 'DELETE',
      url: `/api/v1/users/${CAROL_ID}`,
      headers: reqHeaders,
    });
    expect(res.statusCode).toBe(204);
  });

  skipIfNoKc('two concurrent removals of the only two admins → exactly one 204 and one 409', async () => {
    const [resA, resB] = await Promise.all([
      server.inject({ method: 'DELETE', url: `/api/v1/users/${ALICE_ID}`, headers: reqHeaders }),
      server.inject({ method: 'DELETE', url: `/api/v1/users/${BOB_ID}`, headers: reqHeaders }),
    ]);

    // DETERMINISM: WHICH request wins is timing-dependent, but the outcome
    // distribution is not. If both fast-path checks pass before either side
    // commits, the per-tenant advisory lock serializes the authoritative
    // re-checks: the loser waits for the winner's COMMIT, sees its soft
    // delete and throws 409. If the loser's fast path runs only after the
    // winner already committed, it throws 409 there instead. Both
    // interleavings yield exactly [204, 409] — never two removals.
    const statuses = [resA.statusCode, resB.statusCode].sort((a, b) => a - b);
    expect(statuses).toEqual([204, 409]);

    const loser = resA.statusCode === 409 ? resA : resB;
    const body = JSON.parse(loser.body) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('CONFLICT');
    expect(body.error.message).toBe('Cannot remove the last active tenant admin');

    // The invariant that must ALWAYS hold: never zero active admin profiles.
    expect(await countActiveAdminProfiles()).toBe(1);
  });
});
