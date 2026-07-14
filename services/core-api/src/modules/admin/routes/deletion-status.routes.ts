// routes/deletion-status.routes.ts
// Deletion saga inspection + manual retry (S5-702 / ADR-022 Decision 1).
//
//   GET  /api/v1/admin/tenants/:id/deletion-status — saga step status snapshot
//   POST /api/v1/admin/deletions/:stepId/retry      — reset a failed step + re-run
//
// Mounted under /api/v1/admin by modules/admin/index.ts, so route paths are
// RELATIVE. requireSuperAdmin is applied BOTH at the admin scope and here per
// route (defense in depth, matches tenant-list pattern).

import { z } from 'zod';

import { withCoreDb } from '../../../lib/tenant-database.js';
import { ValidationError } from '../../../lib/app-error.js';
import { requireSuperAdmin } from '../../../middleware/require-super-admin.js';
import { getDeletionStatus } from '../services/deletion-saga.service.js';
import { retryFailedStep } from '../services/deletion-retry.service.js';

import type { FastifyInstance } from 'fastify';

const TenantIdParamsSchema = z.object({
  id: z.string().uuid(),
});

const StepIdParamsSchema = z.object({
  stepId: z.string().uuid(),
});

export async function deletionStatusRoutes(
  fastify: FastifyInstance
): Promise<void> {
  // ── GET /api/v1/admin/tenants/:id/deletion-status ───────────────────────────
  fastify.get(
    '/tenants/:id/deletion-status',
    { preHandler: [requireSuperAdmin] },
    async (request) => {
      const parsed = TenantIdParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        throw new ValidationError(
          parsed.error.issues.map((i) => i.message).join(', ')
        );
      }

      const { id } = parsed.data;

      const steps = await withCoreDb((prisma) => getDeletionStatus(prisma, id));

      return {
        steps: steps.map((s) => ({
          id: s.id,
          step: s.step,
          status: s.status,
          attempts: s.attempts,
          lastError: s.lastError,
          updatedAt: s.updatedAt,
        })),
      };
    }
  );

  // ── POST /api/v1/admin/deletions/:stepId/retry ──────────────────────────────
  fastify.post(
    '/deletions/:stepId/retry',
    { preHandler: [requireSuperAdmin] },
    async (request) => {
      const parsed = StepIdParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        throw new ValidationError(
          parsed.error.issues.map((i) => i.message).join(', ')
        );
      }

      const { stepId } = parsed.data;
      const actorId = request.user.keycloakUserId;

      const step = await withCoreDb((prisma) =>
        retryFailedStep(prisma, stepId, actorId)
      );

      return {
        step: step.step,
        status: step.status,
        attempts: step.attempts,
      };
    }
  );
}
