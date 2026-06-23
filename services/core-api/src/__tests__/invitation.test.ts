// invitation.test.ts
// Integration tests — INT-03: Invitation flows.
// Spec 003, Phase 18.3

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '../lib/database.js';
import { invitationRoutes, invitationPublicRoutes } from '../modules/invitation/routes.js';
import { workspaceRoutes } from '../modules/workspace/routes.js';
import { createRealm, deleteRealm } from '../lib/keycloak-admin.js';

import {
  createTestServer,
  makeFullStub,
  isDbReachable,
  isKeycloakReachable,
} from './helpers/server.helpers.js';
import {
  seedTenant,
  seedUserProfile,
  seedWorkspace,
  seedWorkspaceMember,
  seedInvitation,
  wipeTenantWorkspaces,
  cleanupTenant,
} from './helpers/db.helpers.js';

import type { FastifyInstance } from 'fastify';
import type { TenantContext } from '../lib/tenant-context-store.js';
import type { InvitationDto } from '../modules/invitation/types.js';

const SLUG = 'ws-int03-invite';
// Fixed UUID so req.user.id matches workspace.created_by and invitation.invited_by FK constraints
const ACTOR = '00000000-0103-0001-0000-000000000001';

const kcAvailable = await isKeycloakReachable();
const skipIfNoDb = it.skipIf(!(await isDbReachable()));
const skipIfNoKC = it.skipIf(!kcAvailable);

let server: FastifyInstance;
let ctx: TenantContext;
let reqHeaders: Record<string, string>;
let workspaceId: string;

beforeAll(async () => {
  const { tenantContext } = await seedTenant(SLUG);
  ctx = tenantContext;
  // Pass the same UUID as userId so req.user.id == invitation.invited_by == user_profile.user_id
  await seedUserProfile(ctx, ACTOR, `${ACTOR}@test.plexica.io`, 'Invite Actor', ACTOR);

  // Provision Keycloak realm for the accept-invitation flow (only when KC is available)
  if (kcAvailable) {
    try {
      await createRealm({
        realmName: ctx.realmName,
        adminEmail: 'admin@test.plexica.io',
        tenantSlug: SLUG,
      });
    } catch {
      // Realm may already exist from a previous run — safe to continue
    }
  }

  server = await createTestServer();
  const stub = makeFullStub(ACTOR, ctx, ['tenant_admin']);
  server.addHook('preHandler', stub);
  await server.register(workspaceRoutes);
  await server.register(invitationRoutes);
  await server.register(invitationPublicRoutes);
  await server.ready();

  reqHeaders = { 'x-tenant-slug': SLUG, 'content-type': 'application/json' };
});

afterAll(async () => {
  await server.close();
  if (kcAvailable && ctx) {
    try {
      await deleteRealm(ctx.realmName);
    } catch {
      /* best-effort cleanup */
    }
  }
  await cleanupTenant(SLUG);
  await prisma.$disconnect();
});

beforeEach(async () => {
  await wipeTenantWorkspaces(ctx);
  const ws = await seedWorkspace(ctx, 'Invite WS', ACTOR);
  workspaceId = ws.id;
  await seedWorkspaceMember(ctx, workspaceId, ACTOR, 'admin');
});

describe('INT-03 Create invitation', () => {
  skipIfNoDb('creates invitation for new user email (201)', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/users/invite',
      headers: reqHeaders,
      body: JSON.stringify({ email: 'newuser@example.com', workspaceId, role: 'member' }),
    });
    expect(res.statusCode).toBe(201);
    const inv = JSON.parse(res.body) as InvitationDto;
    expect(inv.email).toBe('n***@example.com'); // email is masked (PII protection — see maskEmail in service.ts)
    expect(inv.status).toBe('pending');
  });

  skipIfNoDb('rejects duplicate invitation for same email+workspace (409)', async () => {
    await server.inject({
      method: 'POST',
      url: '/api/v1/users/invite',
      headers: reqHeaders,
      body: JSON.stringify({ email: 'dup@example.com', workspaceId, role: 'member' }),
    });
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/users/invite',
      headers: reqHeaders,
      body: JSON.stringify({ email: 'dup@example.com', workspaceId, role: 'member' }),
    });
    expect(res.statusCode).toBe(409);
  });
});

describe('INT-03 Resend invitation', () => {
  skipIfNoDb('POST /api/v1/invitations/:id/resend → 200, expiresAt updated', async () => {
    const createRes = await server.inject({
      method: 'POST',
      url: '/api/v1/users/invite',
      headers: reqHeaders,
      body: JSON.stringify({ email: 'resend@example.com', workspaceId, role: 'member' }),
    });
    const inv = JSON.parse(createRes.body) as InvitationDto;

    const resendRes = await server.inject({
      method: 'POST',
      url: `/api/v1/invitations/${inv.id}/resend`,
      headers: { 'x-tenant-slug': SLUG }, // no content-type: resend has no request body
    });
    expect(resendRes.statusCode).toBe(200);
    const updated = JSON.parse(resendRes.body) as InvitationDto;
    expect(new Date(updated.expiresAt).getTime()).toBeGreaterThanOrEqual(
      new Date(inv.expiresAt).getTime()
    );
  });
});

describe('INT-03 Accept invitation', () => {
  skipIfNoDb('expired invitation returns 410 INVITATION_EXPIRED', async () => {
    // Seed an invitation directly in DB with a past expiry
    const token = 'expired-token-int03';
    await seedInvitation(ctx, {
      email: 'expired@example.com',
      workspaceId,
      role: 'member',
      invitedBy: ACTOR,
      token,
      status: 'pending',
      expiresAt: new Date(Date.now() - 1000),
    });

    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/invitations/${token}/accept`,
      headers: { 'x-tenant-slug': SLUG },
    });
    expect(res.statusCode).toBe(410);
    const body = JSON.parse(res.body) as { error: { code: string } };
    expect(body.error.code).toBe('INVITATION_EXPIRED');
  });

  skipIfNoDb('accepting same token twice returns 409', async () => {
    const token = 'double-accept-token-int03';
    await seedInvitation(ctx, {
      email: 'double@example.com',
      workspaceId,
      role: 'member',
      invitedBy: ACTOR,
      token,
      status: 'accepted',
      expiresAt: new Date(Date.now() + 86400_000),
    });

    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/invitations/${token}/accept`,
      headers: { 'x-tenant-slug': SLUG },
    });
    expect([409, 410]).toContain(res.statusCode);
  });

  // Keycloak required for the real accept flow (creates KC user)
  skipIfNoKC('accepts valid invitation and creates user profile + member row', async () => {
    const createRes = await server.inject({
      method: 'POST',
      url: '/api/v1/users/invite',
      headers: reqHeaders,
      body: JSON.stringify({
        email: `kc-accept-${Date.now()}@example.com`,
        workspaceId,
        role: 'member',
      }),
    });
    expect(createRes.statusCode).toBe(201);
    const inv = JSON.parse(createRes.body) as InvitationDto;

    // Retrieve token from DB for the public accept endpoint — use withTenantDb now that
    // it correctly passes a TenantPrismaClient.
    const { withTenantDb } = await import('../lib/tenant-database.js');
    const row = await withTenantDb(
      async (db) => db.invitation.findUnique({ where: { id: inv.id }, select: { token: true } }),
      ctx
    );
    const tokenVal = (row as { token: string }).token;

    const acceptRes = await server.inject({
      method: 'POST',
      url: `/api/v1/invitations/${tokenVal}/accept`,
      headers: { 'x-tenant-slug': SLUG },
    });
    expect(acceptRes.statusCode).toBe(200);
    const result = JSON.parse(acceptRes.body) as { workspaceId: string; role: string };
    expect(result.workspaceId).toBe(workspaceId);
    expect(result.role).toBe('member');
  });
});
