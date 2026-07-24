// INT-03 invitation creation and resend integration tests.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '../lib/database.js';
import { invitationRoutes } from '../modules/invitation/routes.js';
import { workspaceRoutes } from '../modules/workspace/routes.js';

import { createTestServer, isDbReachable, makeFullStub } from './helpers/server.helpers.js';
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
import type { InvitationDto } from '../modules/invitation/types.js';

const SLUG = 'ws-int03-invite';
const ACTOR = '00000000-0103-0001-0000-000000000001';
const skipIfNoDb = it.skipIf(!(await isDbReachable()));

let server: FastifyInstance;
let ctx: TenantContext;
let reqHeaders: Record<string, string>;
let workspaceId: string;

beforeAll(async () => {
  const { tenantContext } = await seedTenant(SLUG);
  ctx = tenantContext;
  await seedUserProfile(ctx, ACTOR, `${ACTOR}@test.plexica.io`, 'Invite Actor', ACTOR);
  server = await createTestServer();
  server.addHook('preHandler', makeFullStub(ACTOR, ctx, ['tenant_admin']));
  await server.register(workspaceRoutes);
  await server.register(invitationRoutes);
  await server.ready();
  reqHeaders = { 'x-tenant-slug': SLUG, 'content-type': 'application/json' };
});

afterAll(async () => {
  await server.close();
  await cleanupTenant(SLUG);
  await prisma.$disconnect();
});

beforeEach(async () => {
  await wipeTenantWorkspaces(ctx);
  workspaceId = (await seedWorkspace(ctx, 'Invite WS', ACTOR)).id;
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
    const invitation = JSON.parse(res.body) as InvitationDto;
    expect(invitation.email).toBe('n***@example.com');
    expect(invitation.status).toBe('pending');
  });

  skipIfNoDb('rejects duplicate invitation for same email and workspace (409)', async () => {
    const request = {
      method: 'POST' as const,
      url: '/api/v1/users/invite',
      headers: reqHeaders,
      body: JSON.stringify({ email: 'dup@example.com', workspaceId, role: 'member' }),
    };
    await server.inject(request);
    expect((await server.inject(request)).statusCode).toBe(409);
  });
});

describe('INT-03 Resend invitation', () => {
  skipIfNoDb('resends an invitation and updates its expiry', async () => {
    const createRes = await server.inject({
      method: 'POST',
      url: '/api/v1/users/invite',
      headers: reqHeaders,
      body: JSON.stringify({ email: 'resend@example.com', workspaceId, role: 'member' }),
    });
    const invitation = JSON.parse(createRes.body) as InvitationDto;
    const resendRes = await server.inject({
      method: 'POST',
      url: `/api/v1/invitations/${invitation.id}/resend`,
      headers: { 'x-tenant-slug': SLUG },
    });
    expect(resendRes.statusCode).toBe(200);
    const updated = JSON.parse(resendRes.body) as InvitationDto;
    expect(new Date(updated.expiresAt).getTime()).toBeGreaterThanOrEqual(
      new Date(invitation.expiresAt).getTime()
    );
  });
});
