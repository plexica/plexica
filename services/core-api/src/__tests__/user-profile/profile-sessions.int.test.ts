// profile-sessions.int.test.ts
// INT: profile sessions + Keycloak-first email sync (006-11/13) against a REAL
// Keycloak realm created via the production provision path (createRealm) and
// removed in cleanup (deleteRealm). The realm user never logs in, so its
// session list is deterministically empty — every DELETE then exercises the
// F4 ownership-first 404 without depending on another test's login state.
//
// NOTE (tasks.md path drift): vitest discovers ONLY src/__tests__/** (see
// vitest.config.ts) — a file under modules/user-profile/__tests__/ would never
// run. This test lives in the discovered integration dir instead.

import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { KeycloakError } from '../../lib/app-error.js';
import { prisma } from '../../lib/database.js';
import { createRealm, deleteRealm } from '../../lib/keycloak-admin.js';
import { createRealmUser, listUserSessions } from '../../lib/keycloak-admin-users.js';
import { withTenantDb } from '../../lib/tenant-database.js';
import { toRealmName } from '../../lib/tenant-schema-helpers.js';
import { getProfile, updateProfile } from '../../modules/user-profile/service.js';
import { userProfileRoutes } from '../../modules/user-profile/routes.js';
import { cleanupTenant, seedTenant, seedUserProfile } from '../helpers/db.helpers.js';
import {
  createTestServer,
  isDbReachable,
  isKeycloakReachable,
  makeFullStub,
} from '../helpers/server.helpers.js';

import type { FastifyInstance } from 'fastify';
import type { TenantContext } from '../../lib/tenant-context-store.js';

const SLUG = 'prof-int-sessions';
const EMAIL = `sessions-int-${Date.now()}@test.plexica.io`;

const skipIfNoStack = it.skipIf(!(await isDbReachable()) || !(await isKeycloakReachable()));

let server: FastifyInstance;
let ctx: TenantContext;
let realmName: string;
let kcUserId: string;

beforeAll(async () => {
  if (!(await isDbReachable()) || !(await isKeycloakReachable())) return;
  realmName = toRealmName(SLUG);
  ctx = (await seedTenant(SLUG)).tenantContext;
  await createRealm({
    realmName,
    adminEmail: `admin-${Date.now()}@test.plexica.io`,
    tenantSlug: SLUG,
  });
  ({ userId: kcUserId } = await createRealmUser(realmName, EMAIL, 'Session Int User'));
  await seedUserProfile(ctx, kcUserId, EMAIL, 'Session Int User');

  server = await createTestServer();
  server.addHook('preHandler', makeFullStub(kcUserId, ctx, ['member']));
  await server.register(userProfileRoutes);
  await server.ready();
}, 60_000);

afterAll(async () => {
  await server?.close().catch(() => {});
  if (realmName !== undefined) await deleteRealm(realmName).catch(() => {});
  await cleanupTenant(SLUG).catch(() => {});
  await prisma.$disconnect();
});

describe('profile sessions (INT, real Keycloak)', () => {
  skipIfNoStack(
    'GET /profile/sessions lists the caller sessions (empty, never logged in)',
    async () => {
      const res = await server.inject({ method: 'GET', url: '/api/v1/profile/sessions' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ sessions: [] });
    }
  );

  skipIfNoStack(
    'DELETE /profile/sessions/:unknown → 404 NOT_FOUND (F4, no enumeration)',
    async () => {
      const res = await server.inject({
        method: 'DELETE',
        url: `/api/v1/profile/sessions/${randomUUID()}`,
      });
      expect(res.statusCode).toBe(404);
      expect(JSON.parse(res.body)).toMatchObject({ error: { code: 'NOT_FOUND' } });
    }
  );

  skipIfNoStack(
    'DELETE a foreign Keycloak user id (not a session id) → 404, no side effects',
    async () => {
      // F4 ownership gate: the id is not one of the caller's sessions, so the
      // request 404s BEFORE any Keycloak delete is issued. A real foreign
      // *session* id cannot be minted here — realm clients disable direct access
      // grants, so no password-grant login is possible — and is covered instead
      // by E2E 006-13 (member logs in via browser, admin revokes → 404, the
      // member session survives).
      const { userId: otherId } = await createRealmUser(
        realmName,
        `other-${Date.now()}@test.plexica.io`,
        'Other'
      );
      const res = await server.inject({
        method: 'DELETE',
        url: `/api/v1/profile/sessions/${otherId}`,
      });
      expect(res.statusCode).toBe(404);
      expect(JSON.parse(res.body)).toMatchObject({ error: { code: 'NOT_FOUND' } });

      // The other user was never touched: no session created, none revoked.
      await expect(listUserSessions(realmName, otherId)).resolves.toEqual([]);
    }
  );

  skipIfNoStack(
    'PATCH /profile email syncs Keycloak FIRST then writes locally (006-11)',
    async () => {
      const next = `updated-${Date.now()}@test.plexica.io`;
      const res = await server.inject({
        method: 'PATCH',
        url: '/api/v1/profile',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: next }),
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toMatchObject({ email: next });

      const reread = await server.inject({ method: 'GET', url: '/api/v1/profile' });
      expect(JSON.parse(reread.body)).toMatchObject({ email: next });
    }
  );

  skipIfNoStack('PATCH /profile rejects a malformed email with 422', async () => {
    const res = await server.inject({
      method: 'PATCH',
      url: '/api/v1/profile',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email' }),
    });
    expect(res.statusCode).toBe(422);
  });

  skipIfNoStack(
    'failed Keycloak sync → KeycloakError, no local write (no divergence)',
    async () => {
      const before = await withTenantDb((db) => getProfile(db, kcUserId, ctx), ctx);
      const badCtx: TenantContext = { ...ctx, realmName: 'plexica-realm-that-does-not-exist' };
      await expect(
        withTenantDb(
          (db) =>
            updateProfile(db, kcUserId, { email: `fail-${Date.now()}@test.plexica.io` }, badCtx),
          badCtx
        )
      ).rejects.toBeInstanceOf(KeycloakError);
      const after = await withTenantDb((db) => getProfile(db, kcUserId, ctx), ctx);
      expect(after.email).toBe(before.email);
    }
  );

  skipIfNoStack('getProfile merges the JWT picture claim + account URL (006-12/14)', async () => {
    const picture = 'https://idp.example.com/photos/user.jpg';
    const profile = await withTenantDb((db) => getProfile(db, kcUserId, ctx, picture), ctx);
    expect(profile.avatarUrl).toBe(picture);
    expect(profile.avatarSource).toBe('keycloak');
    expect(profile.keycloakAccountUrl).toContain(`/realms/${realmName}/account`);

    const plain = await withTenantDb((db) => getProfile(db, kcUserId, ctx), ctx);
    expect(plain.avatarSource).toBe('upload');
    expect(plain.keycloakAccountUrl).toContain(`/realms/${realmName}/account`);
  });
});
