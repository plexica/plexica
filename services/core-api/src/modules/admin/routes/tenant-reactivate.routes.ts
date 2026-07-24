// routes/tenant-reactivate.routes.ts
// POST /api/v1/admin/tenants/:id/reactivate — reactivate a suspended tenant
// (S5-601). Reverse of tenant-suspend.routes.ts.
//
// Body carries `version` (the tenant row version the client read) used as the
// optimistic-lock expected version by tenant-reactivate.service.ts.
//
// Mounted under /api/v1/admin by modules/admin/index.ts, so the route path is
// RELATIVE (/tenants/:id/reactivate). requireSuperAdmin is applied BOTH at the
// admin scope and here per route (defense in depth, matches tenant-list /
// tenant-delete pattern).
//
// Errors:
//   - 422 invalid body / params
//   - 404 tenant not found (pre-check, distinct from 409 conflict)
//   - 409 version mismatch or tenant not in `suspended` status (ConflictError
//     surfaced from the service's optimistic-lock transaction)

import { z } from 'zod';

import { withCoreDb } from '../../../lib/tenant-database.js';
import { NotFoundError, ValidationError } from '../../../lib/app-error.js';
import { requireSuperAdmin } from '../../../middleware/require-super-admin.js';
import { reactivateTenant } from '../services/tenant-reactivate.service.js';

import type { FastifyInstance } from 'fastify';

const TenantReactivateParamsSchema = z.object({
  id: z.string().uuid(),
});

const TenantReactivateBodySchema = z.object({
  version: z.number().int().min(1),
});

export async function tenantReactivateRoutes(
  fastify: FastifyInstance
): Promise<void> {
  fastify.post(
    '/tenants/:id/reactivate',
    { preHandler: [requireSuperAdmin] },
    async (request, reply) => {
      const paramsParsed =
        TenantReactivateParamsSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        throw new ValidationError(
          paramsParsed.error.issues.map((i) => i.message).join(', ')
        );
      }

      const bodyParsed = TenantReactivateBodySchema.safeParse(request.body);
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

        const result = await reactivateTenant(prisma, id, version, actorId);
        if (result.reconciliation === 'pending') return reply.status(202).send(result);
        return result;
      });
    }
  );
}
