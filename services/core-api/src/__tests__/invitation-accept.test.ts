// INT-03 public invitation acceptance through production route scopes.

import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '../lib/database.js';
import { authMiddleware } from '../middleware/auth-middleware.js';
import { tenantContextMiddleware } from '../middleware/tenant-context.js';
import { userProfileResolver } from '../middleware/user-profile-resolver.js';
import { invitationPublicRoutes, invitationRoutes } from '../modules/invitation/routes.js';

import { createTestServer, isDbReachable } from './helpers/server.helpers.js';
import {
  cleanupTenant,
  seedInvitation,
  seedTenant,
  seedUserProfile,
  seedWorkspace,
  wipeTenantWorkspaces,
} from './helpers/db.helpers.js';

import type { FastifyInstance } from 'fastify';
import type { TenantStatus } from '@prisma/client';
import type { TenantContext } from '../lib/tenant-context-store.js';

const SLUG = 'ws-int03-accept';
const OTHER_SLUG = 'ws-int03-other';
const ACTOR = '00000000-0103-0002-0000-000000000001';
const suite = describe.skipIf(!(await isDbReachable()));

suite('INT-03 public invitation acceptance', () => {
  let server: FastifyInstance;
  let ctx: TenantContext;
  let workspaceId: string;

  const host = (slug: string): string => `${slug}.example.test`;
  const accept = (token: string, requestHost = host(SLUG), headers = {}) =>
    server.inject({
      method: 'POST',
      url: `/api/v1/invitations/${token}/accept`,
      headers: { host: requestHost, ...headers },
    });

  async function seedPending(token: string, expiresAt: Date): Promise<void> {
    const email = `${token}@example.test`;
    await seedUserProfile(ctx, randomUUID(), email);
    await seedInvitation(ctx, {
      email,
      workspaceId,
      role: 'member',
      invitedBy: ACTOR,
      token,
      status: 'pending',
      expiresAt,
    });
  }

  beforeAll(async () => {
    ctx = (await seedTenant(SLUG)).tenantContext;
    await seedTenant(OTHER_SLUG);
    await seedUserProfile(ctx, ACTOR, `${ACTOR}@example.test`, 'Invite Actor', ACTOR);

    server = await createTestServer();
    await server.register(invitationPublicRoutes);
    await server.register(async (tenantScope) => {
      tenantScope.addHook('preHandler', authMiddleware);
      tenantScope.addHook('preHandler', tenantContextMiddleware);
      tenantScope.addHook('preHandler', userProfileResolver);
      await tenantScope.register(invitationRoutes);
    });
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
    await cleanupTenant(SLUG);
    await cleanupTenant(OTHER_SLUG);
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.tenant.update({ where: { id: ctx.tenantId }, data: { status: 'active' } });
    await wipeTenantWorkspaces(ctx);
    workspaceId = (await seedWorkspace(ctx, 'Accept Invite WS', ACTOR)).id;
  });

  it('accepts a valid capability without a JWT', async () => {
    const token = 'valid-token-int03';
    await seedPending(token, new Date(Date.now() + 86_400_000));

    const response = await accept(token);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({ workspaceId, role: 'member' });
  });

  it('returns the generic capability error for an invalid token', async () => {
    const response = await accept('invalid-token-int03');
    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body)).toMatchObject({
      error: { code: 'INVITATION_NOT_FOUND', message: 'Invitation not found' },
    });
  });

  it('rejects an expired token without a JWT', async () => {
    const token = 'expired-token-int03';
    await seedPending(token, new Date(Date.now() - 1_000));
    const response = await accept(token);
    expect(response.statusCode).toBe(410);
    expect(JSON.parse(response.body)).toMatchObject({ error: { code: 'INVITATION_EXPIRED' } });
  });

  it('rejects replay after a successful acceptance', async () => {
    const token = 'replayed-token-int03';
    await seedPending(token, new Date(Date.now() + 86_400_000));
    expect((await accept(token)).statusCode).toBe(200);
    const replay = await accept(token);
    expect(replay.statusCode).toBe(409);
    expect(JSON.parse(replay.body)).toMatchObject({
      error: { code: 'INVITATION_ALREADY_ACCEPTED' },
    });
  });

  it('does not distinguish a wrong tenant from an invalid token', async () => {
    const token = 'wrong-tenant-token-int03';
    await seedPending(token, new Date(Date.now() + 86_400_000));
    const invalid = await accept('invalid-token-int03');
    const wrongTenant = await accept(token, host(OTHER_SLUG));
    expect(wrongTenant.statusCode).toBe(404);
    expect(JSON.parse(wrongTenant.body)).toEqual(JSON.parse(invalid.body));
  });

  it('rejects an unknown host with the generic capability error', async () => {
    const response = await accept('unknown-host-token', 'unknown.example.test');
    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body)).toMatchObject({ error: { code: 'INVITATION_NOT_FOUND' } });
  });

  it.each<TenantStatus>(['suspended', 'pending_deletion'])(
    'rejects a %s tenant with the generic capability error',
    async (status) => {
      await prisma.tenant.update({ where: { id: ctx.tenantId }, data: { status } });
      const response = await accept('inactive-tenant-token');
      expect(response.statusCode).toBe(404);
      expect(JSON.parse(response.body)).toMatchObject({ error: { code: 'INVITATION_NOT_FOUND' } });
    }
  );

  it('ignores X-Tenant-Slug when resolving the public capability tenant', async () => {
    const token = 'header-override-token';
    await seedPending(token, new Date(Date.now() + 86_400_000));
    const response = await accept(token, host(SLUG), { 'x-tenant-slug': OTHER_SLUG });
    expect(response.statusCode).toBe(200);
  });

  it('keeps invitation create, list, and resend routes authenticated', async () => {
    const responses = await Promise.all([
      server.inject({ method: 'POST', url: '/api/v1/users/invite' }),
      server.inject({
        method: 'GET',
        url: `/api/v1/workspaces/${workspaceId}/invitations`,
      }),
      server.inject({ method: 'POST', url: `/api/v1/invitations/${randomUUID()}/resend` }),
    ]);
    expect(responses.map(({ statusCode }) => statusCode)).toEqual([401, 401, 401]);
  });
});
