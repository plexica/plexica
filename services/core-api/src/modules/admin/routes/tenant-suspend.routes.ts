// routes/tenant-suspend.routes.ts
// POST /api/v1/admin/tenants/:id/suspend — suspend an active tenant (S5-501).
//
// Body carries `version` (the tenant row version the client read) used as the
// optimistic-lock expected version by tenant-suspend.service.ts.
//
// Mounted under /api/v1/admin by modules/admin/index.ts, so the route path is
// RELATIVE (/tenants/:id/suspend). requireSuperAdmin is applied BOTH at the
// admin scope and here per route (defense in depth, matches tenant-list /
// tenant-delete pattern).
//
// Errors:
//   - 422 invalid body / params
//   - 404 tenant not found (pre-check, distinct from 409 conflict)
//   - 409 version mismatch or tenant not in `active` status (ConflictError
//     surfaced from the service's optimistic-lock transaction)

import { z } from 'zod';

import { withCoreDb } from '../../../lib/tenant-database.js';
import { NotFoundError, ValidationError } from '../../../lib/app-error.js';
import { requireSuperAdmin } from '../../../middleware/require-super-admin.js';
import { suspendTenant } from '../services/tenant-suspend.service.js';

import type { FastifyInstance } from 'fastify';

const TenantSuspendParamsSchema = z.object({
  id: z.string().uuid(),
});

const TenantSuspendBodySchema = z.object({
  version: z.number().int().min(1),
});

export async function tenantSuspendRoutes(
  fastify: FastifyInstance
): Promise<void> {
  fastify.post(
    '/tenants/:id/suspend',
    { preHandler: [requireSuperAdmin] },
    async (request, reply) => {
      const paramsParsed = TenantSuspendParamsSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        throw new ValidationError(
          paramsParsed.error.issues.map((i) => i.message).join(', ')
        );
      }

      const bodyParsed = TenantSuspendBodySchema.safeParse(request.body);
      if (!bodyParsed.success) {
        throw new ValidationError(
          bodyParsed.error.issues.map((i) => i.message).join(', ')
        );
      }

      const { id } = paramsParsed.data;
      const { version } = bodyParsed.data;
      const actorId = request.user.keycloakUserId;

      return withCoreDb(async (prisma) => {
        const tenant = await prisma.tenant.findUnique({
          where: { id },
          select: { id: true },
        });
        if (tenant === null) {
          throw new NotFoundError('Tenant not found');
        }

        const result = await suspendTenant(prisma, id, version, actorId);
        if (result.reconciliation === 'pending') return reply.status(202).send(result);
        return result;
      });
    }
  );
}
