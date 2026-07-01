// routes/dlq.routes.ts
// Super admin DLQ management routes — list, retry, dismiss.

import { z } from 'zod';

import { withCoreDb } from '../../../lib/tenant-database.js';
import { requireSuperAdmin } from '../../../middleware/require-super-admin.js';
import { retryDlqEntry } from '../events/dlq.service.js';
import { PluginNotFoundError } from '../errors.js';
import { ValidationError } from '../../../lib/app-error.js';

import type { FastifyInstance } from 'fastify';

const DlqPageSizeMax = 100;

const listQuerySchema = z.object({
  status: z.enum(['pending', 'retried', 'dismissed']).optional(),
  pluginId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).max(100).default(1),
  pageSize: z.coerce.number().int().min(1).max(DlqPageSizeMax).default(50),
});

export async function dlqRoutes(fastify: FastifyInstance): Promise<void> {
  // ── GET /api/v1/admin/system/dlq ──────────────────────────────────────────
  fastify.get(
    '/api/v1/admin/system/dlq',
    { preHandler: [requireSuperAdmin] },
    async (request) => {
      const parsed = listQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.issues.map((i) => i.message).join(', '));
      }

      const { status, pluginId, page, pageSize } = parsed.data;
      const where: Record<string, unknown> = {};
      if (status) where.status = status;
      if (pluginId) where.pluginId = pluginId;

      return withCoreDb((prisma) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (prisma as any).$transaction(async (tx: any) => {
          const [data, total] = await Promise.all([
            tx.deadLetterQueue.findMany({
              where,
              skip: (page - 1) * pageSize,
              take: pageSize,
              orderBy: { failedAt: 'desc' },
            }),
            tx.deadLetterQueue.count({ where }),
          ]);
          return { data, total, page, pageSize };
        })
      );
    }
  );

  const idParamSchema = z.object({ id: z.string().uuid() });

  // ── POST /api/v1/admin/system/dlq/:id/retry ───────────────────────────────
  fastify.post(
    '/api/v1/admin/system/dlq/:id/retry',
    { preHandler: [requireSuperAdmin] },
    async (request) => {
      const parsed = idParamSchema.safeParse(request.params);
      if (!parsed.success) throw new ValidationError('Invalid DLQ entry ID');
      const { id } = parsed.data;

      return withCoreDb((prisma) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (prisma as any).$transaction(async (tx: any) => {
          const entry = await tx.deadLetterQueue.findUnique({ where: { id } });
          if (!entry) throw new PluginNotFoundError(`DLQ entry ${id}`);

          // Re-emit the event
          await retryDlqEntry(entry.eventType, entry.payload as Record<string, unknown>);

          // Update status
          await tx.deadLetterQueue.update({
            where: { id },
            data: { status: 'retried', resolvedAt: new Date() },
          });

          return { status: 'retried' };
        })
      );
    }
  );

  // ── POST /api/v1/admin/system/dlq/:id/dismiss ─────────────────────────────
  fastify.post(
    '/api/v1/admin/system/dlq/:id/dismiss',
    { preHandler: [requireSuperAdmin] },
    async (request) => {
      const parsed = idParamSchema.safeParse(request.params);
      if (!parsed.success) throw new ValidationError('Invalid DLQ entry ID');
      const { id } = parsed.data;

      return withCoreDb((prisma) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (prisma as any).$transaction(async (tx: any) => {
          const entry = await tx.deadLetterQueue.findUnique({ where: { id } });
          if (!entry) throw new PluginNotFoundError(`DLQ entry ${id}`);

          await tx.deadLetterQueue.update({
            where: { id },
            data: { status: 'dismissed', resolvedAt: new Date() },
          });

          return { status: 'dismissed' };
        })
      );
    }
  );
}
