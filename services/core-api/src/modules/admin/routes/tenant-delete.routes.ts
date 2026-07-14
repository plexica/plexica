// routes/tenant-delete.routes.ts
// DELETE /api/v1/admin/tenants/:id — start forward-only GDPR deletion saga
// (S5-702 / ADR-022 Decision 1).
//
// Type-to-confirm: the body must include `confirmSlug` matching the tenant's
// slug exactly (422 CONFIRMATION_REQUIRED otherwise) plus the tenant `version`
// the client read — used as the optimistic-lock expected version by the saga.
// Returns 202 immediately; step execution runs in the background (setImmediate).
//
// Mounted under /api/v1/admin by modules/admin/index.ts, so the route path is
// RELATIVE (/tenants/:id). requireSuperAdmin is applied BOTH at the admin
// scope and here per route (defense in depth, matches tenant-list pattern).

import { z } from 'zod';

import { withCoreDb } from '../../../lib/tenant-database.js';
import {
  ConfirmationRequiredError,
  NotFoundError,
  ValidationError,
} from '../../../lib/app-error.js';
import { requireSuperAdmin } from '../../../middleware/require-super-admin.js';
import { startDeletionSaga } from '../services/deletion-saga.service.js';

import type { FastifyInstance, FastifyReply } from 'fastify';

const TenantDeleteParamsSchema = z.object({
  id: z.string().uuid(),
});

const TenantDeleteBodySchema = z.object({
  confirmSlug: z.string().min(1).max(255),
  version: z.number().int().min(0),
});

export async function tenantDeleteRoutes(
  fastify: FastifyInstance
): Promise<void> {
  // ── DELETE /api/v1/admin/tenants/:id ────────────────────────────────────────
  fastify.delete(
    '/tenants/:id',
    { preHandler: [requireSuperAdmin] },
    async (request, reply: FastifyReply) => {
      const paramsParsed = TenantDeleteParamsSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        throw new ValidationError(
          paramsParsed.error.issues.map((i) => i.message).join(', ')
        );
      }

      const bodyParsed = TenantDeleteBodySchema.safeParse(request.body);
      if (!bodyParsed.success) {
        throw new ValidationError(
          bodyParsed.error.issues.map((i) => i.message).join(', ')
        );
      }

      const { id } = paramsParsed.data;
      const { confirmSlug, version } = bodyParsed.data;
      const actorId = request.user.keycloakUserId;

      const result = await withCoreDb(async (prisma) => {
        const tenant = await prisma.tenant.findUnique({
          where: { id },
          select: { slug: true },
        });
        if (tenant === null) {
          throw new NotFoundError('Tenant not found');
        }
        if (tenant.slug !== confirmSlug) {
          throw new ConfirmationRequiredError(
            'confirmSlug does not match the tenant slug'
          );
        }

        return startDeletionSaga(prisma, id, version, actorId);
      });

      return reply.status(202).send(result);
    }
  );
}
