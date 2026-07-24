// routes.ts
// Invitation module Fastify plugin — registers all invitation routes.
// The public accept endpoint resolves its tenant from Host and requires NO auth.
//
// NOTE: authMiddleware, tenantContextMiddleware, and userProfileResolver are
// registered as scope-level addHook('preHandler', ...) in index.ts and run
// automatically for every route in invitationRoutes. Do NOT re-add them here.
// invitationPublicRoutes is registered OUTSIDE the authenticated tenant scope.

import { publicInvitationTenantResolver } from '../../middleware/public-invitation-tenant.js';
import { requireAbac } from '../../middleware/abac.js';
import { ForbiddenError, InvitationNotFoundError, ValidationError } from '../../lib/app-error.js';
import { withTenantDb } from '../../lib/tenant-database.js';

import {
  createInvitationSchema,
  invitationListQuerySchema,
  invitationTokenSchema,
} from './schema.js';
import {
  createInvitationService,
  resendInvitationService,
  listInvitationsService,
} from './service.js';
import { acceptInvitationService } from './service-accept.js';

import type { FastifyInstance } from 'fastify';
import type { ListInvitationsFilters } from './types.js';

export async function invitationRoutes(fastify: FastifyInstance): Promise<void> {
  // ── List invitations for a workspace ─────────────────────────────────────
  fastify.get(
    '/api/v1/workspaces/:id/invitations',
    { preHandler: [requireAbac('invitation:list')] },
    async (req) => {
      const { id } = req.params as { id: string };
      const parsed = invitationListQuerySchema.safeParse(req.query);
      if (!parsed.success)
        throw new ValidationError(parsed.error.issues.map((i) => i.message).join(', '));

      const filters: ListInvitationsFilters = { page: parsed.data.page, limit: parsed.data.limit };
      if (parsed.data.status !== undefined) filters.status = parsed.data.status;

      return withTenantDb((tx) => listInvitationsService(tx, id, filters), req.tenantContext);
    }
  );

  // ── Send invitation (tenant_admin or workspace admin) ─────────────────────
  fastify.post('/api/v1/users/invite', {}, async (req, reply) => {
    const parsed = createInvitationSchema.safeParse(req.body);
    if (!parsed.success)
      throw new ValidationError(parsed.error.issues.map((i) => i.message).join(', '));

    const isTenantAdmin = req.user.roles.includes('tenant_admin');

    if (!isTenantAdmin) {
      // Non-admins must be workspace admin in the target workspace.
      const member = await withTenantDb(async (tx) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (tx as any).workspaceMember.findUnique({
          where: {
            workspaceId_userId: {
              workspaceId: parsed.data.workspaceId,
              userId: req.user.id,
            },
          },
          select: { role: true },
        });
      }, req.tenantContext);

      const role = (member as { role: string } | null)?.role;
      if (role !== 'admin') {
        throw new ForbiddenError('Only tenant admins or workspace admins can invite users');
      }
    }

    const result = await withTenantDb(
      (tx) => createInvitationService(tx, parsed.data, req.user.id, req.tenantContext),
      req.tenantContext
    );
    return reply.status(201).send(result);
  });

  // ── Resend invitation ────────────────────────────────────────────────────
  fastify.post(
    '/api/v1/invitations/:id/resend',
    { preHandler: [requireAbac('invitation:resend')] },
    async (req) => {
      const { id } = req.params as { id: string };
      return withTenantDb(
        (tx) => resendInvitationService(tx, id, req.user.id, req.tenantContext),
        req.tenantContext
      );
    }
  );
}

// ── Public accept route (host tenant required, no auth) ──────────────────────
// Registered separately so the host app can mount it without authMiddleware.
export async function invitationPublicRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    '/api/v1/invitations/:token/accept',
    {
      // Fastify access logs include the URL, which contains the capability token.
      logLevel: 'silent',
      preHandler: [publicInvitationTenantResolver],
    },
    async (req, reply) => {
      const parsedToken = invitationTokenSchema.safeParse(
        (req.params as { token?: unknown }).token
      );
      if (!parsedToken.success) throw new InvitationNotFoundError();

      const result = await withTenantDb(
        (tx) => acceptInvitationService(tx, parsedToken.data, req.tenantContext.realmName),
        req.tenantContext
      );
      return reply.status(200).send(result);
    }
  );
}
