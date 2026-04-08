// abac-decision-log.test.ts
// Integration tests — AC-07: ABAC decision log is written on evaluation.
// Spec 003, Phase 18 (F04 fix — April 2026).
//
// Verifies that calling requireAbac() via a Fastify route causes a row to
// appear in abac_decision_log, with the correct decision value.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '../lib/database.js';
import { withTenantDb } from '../lib/tenant-database.js';
import { workspaceRoutes } from '../modules/workspace/routes.js';

import {
  createTestServer,
  isDbReachable,
  isRedisReachable,
  makeFullStub,
} from './helpers/server.helpers.js';
import {
  cleanupTenant,
  seedTenant,
  seedUserProfile,
  seedWorkspace,
  seedWorkspaceMember,
  wipeTenantWorkspaces,
} from './helpers/db.helpers.js';

import type { FastifyInstance } from 'fastify';
import type { TenantContext } from '../lib/tenant-context-store.js';

const SLUG = 'ws-ac07-declog';
const ADMIN_ID = 'admin-ac07';

const dbOk = await isDbReachable();
const redisOk = await isRedisReachable();
const allOk = dbOk && redisOk;

const skipIfNoStack = it.skipIf(!allOk);

let server: FastifyInstance;
let ctx: TenantContext;
let reqHeaders: Record<string, string>;
let workspaceId: string;

beforeAll(async () => {
  if (!allOk) return;
  const { tenantContext } = await seedTenant(SLUG);
  ctx = tenantContext;
  await seedUserProfile(ctx, ADMIN_ID, `${ADMIN_ID}@test.plexica.io`, 'Admin AC07');

  server = await createTestServer();
  server.addHook('preHandler', makeFullStub(ADMIN_ID, ctx, ['tenant_admin']));
  await server.register(workspaceRoutes);
  await server.ready();

  reqHeaders = { 'x-tenant-slug': SLUG };
});

afterAll(async () => {
  if (!allOk) return;
  await server.close();
  await cleanupTenant(SLUG);
  await prisma.$disconnect();
});

beforeEach(async () => {
  if (!allOk) return;
  await wipeTenantWorkspaces(ctx);
  const ws = await seedWorkspace(ctx, 'DecLog WS', ADMIN_ID);
  workspaceId = ws.id;
  await seedWorkspaceMember(ctx, workspaceId, ADMIN_ID, 'admin');
});

describe('AC-07 ABAC decision log', () => {
  skipIfNoStack('allow decision is recorded in abac_decision_log after GET workspace', async () => {
    // Call a route protected by requireAbac('workspace:read')
    const res = await server.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${workspaceId}`,
      headers: reqHeaders,
    });
    expect(res.statusCode).toBe(200);

    // Give the fire-and-forget log writer a moment to commit
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Query the decision log directly
    const rows = await withTenantDb(
      async (tx) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (tx as any).abacDecisionLog.findMany({
          where: { userId: ADMIN_ID, action: 'workspace:read', resourceId: workspaceId },
          orderBy: { createdAt: 'desc' },
          take: 5,
        }),
      ctx
    );

    expect(rows.length).toBeGreaterThanOrEqual(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((rows[0] as any).decision).toBe('allow');
  });

  skipIfNoStack(
    'deny decision is recorded in abac_decision_log when non-member attempts access',
    async () => {
      // Create a server with a non-member, non-admin stub
      const nonMemberId = 'nonmember-ac07';
      await seedUserProfile(ctx, nonMemberId, `${nonMemberId}@test.plexica.io`, 'Non Member');

      const restrictedServer = await createTestServer();
      restrictedServer.addHook('preHandler', makeFullStub(nonMemberId, ctx, []));
      await restrictedServer.register(workspaceRoutes);
      await restrictedServer.ready();

      const res = await restrictedServer.inject({
        method: 'GET',
        url: `/api/v1/workspaces/${workspaceId}`,
        headers: reqHeaders,
      });
      // Should be denied (403 Forbidden)
      expect(res.statusCode).toBe(403);

      await new Promise((resolve) => setTimeout(resolve, 50));

      const rows = await withTenantDb(
        async (tx) =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (tx as any).abacDecisionLog.findMany({
            where: { userId: nonMemberId, action: 'workspace:read', resourceId: workspaceId },
            orderBy: { createdAt: 'desc' },
            take: 5,
          }),
        ctx
      );

      expect(rows.length).toBeGreaterThanOrEqual(1);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((rows[0] as any).decision).toBe('deny');

      await restrictedServer.close();
    }
  );
});
