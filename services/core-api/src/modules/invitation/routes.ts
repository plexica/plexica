// routes.ts
// Invitation module Fastify plugin — registers all invitation routes.
// The public accept endpoint requires tenantContextMiddleware but NO auth.


import { authMiddleware } from '../../middleware/auth-middleware.js';
import { tenantContextMiddleware } from '../../middleware/tenant-context.js';
import { requireAbac } from '../../middleware/abac.js';
import { ForbiddenError, ValidationError } from '../../lib/app-error.js';
import { withTenantDb } from '../../lib/tenant-database.js';

import { createInvitationSchema, invitationListQuerySchema } from './schema.js';
import {
  createInvitationService,
  resendInvitationService,
  listInvitationsService,
} from './service.js';
import { acceptInvitationService } from './service-accept.js';

import type { FastifyInstance } from 'fastify';
import type { ListInvitationsFilters } from './types.js';

const auth = [authMiddleware, tenantContextMiddleware];

export async function invitationRoutes(fastify: FastifyInstance): Promise<void> {
  // ── List invitations for a workspace ─────────────────────────────────────
  fastify.get(
    '/api/v1/workspaces/:id/invitations',
    { preHandler: [...auth, requireAbac('invitation:list')] },
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
  fastify.post('/api/v1/users/invite', { preHandler: auth }, async (req, reply) => {
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
    { preHandler: [...auth, requireAbac('invitation:resend')] },
    async (req) => {
      const { id } = req.params as { id: string };
      return withTenantDb(
        (tx) => resendInvitationService(tx, id, req.user.id, req.tenantContext),
        req.tenantContext
      );
    }
  );
}

// ── Public accept route (tenant context required, no auth) ───────────────────
// Registered separately so the host app can mount it without authMiddleware.
// Callers must provide X-Tenant-Slug header for tenantContextMiddleware.
export async function invitationPublicRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    '/api/v1/invitations/:token/accept',
    { preHandler: [tenantContextMiddleware] },
    async (req, reply) => {
      const { token } = req.params as { token: string };
      if (!token || token.trim().length === 0) {
        throw new ValidationError('Invitation token is required');
      }

      const result = await withTenantDb(
        (tx) => acceptInvitationService(tx, token, req.tenantContext.realmName),
        req.tenantContext
      );
      return reply.status(200).send(result);
    }
  );
}
