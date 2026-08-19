// routes/dlq.routes.ts
// Super admin DLQ management routes — list, retry, dismiss.

import { z } from 'zod';

import { withCoreDb } from '../../../lib/tenant-database.js';
import { requireSuperAdmin } from '../../../middleware/require-super-admin.js';
import { dismissDlqEntry, retryDlqEntry } from '../events/dlq.service.js';
import { parseOrThrow } from '../../../lib/validation.js';
import { buildPaginatedResult } from '../../../lib/pagination.js';

import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';

const DlqPageSizeMax = 100;

const listQuerySchema = z.object({
  status: z.enum(['pending', 'retried', 'dismissed']).optional(),
  pluginId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).max(100).default(1),
  pageSize: z.coerce.number().int().min(1).max(DlqPageSizeMax).default(50),
});

export async function dlqRoutes(fastify: FastifyInstance): Promise<void> {
  // ── GET /api/v1/admin/system/dlq ──────────────────────────────────────────
  fastify.get('/api/v1/admin/system/dlq', { preHandler: [requireSuperAdmin] }, async (request) => {
    const { status, pluginId, page, pageSize } = parseOrThrow(listQuerySchema, request.query);
    const where: Prisma.DeadLetterQueueWhereInput = {};
    if (status) where.status = status;
    if (pluginId) where.pluginId = pluginId;

    return withCoreDb((prisma) =>
      prisma.$transaction(async (tx) => {
        const [data, total] = await Promise.all([
          tx.deadLetterQueue.findMany({
            where,
            skip: (page - 1) * pageSize,
            take: pageSize,
            orderBy: { failedAt: 'desc' },
          }),
          tx.deadLetterQueue.count({ where }),
        ]);
        // Canonical envelope via buildPaginatedResult (Decision 4, 2026-08-18):
        // { data, total, page, pageSize, totalPages }. The previous hand-built
        // envelope omitted totalPages (page 2+ unreachable from the UI) and
        // renamed limit→pageSize via a spread workaround — both eliminated.
        return buildPaginatedResult(
          data.map((entry) => ({
            ...entry,
            originalOffset: entry.originalOffset.toString(),
          })),
          total,
          { page, pageSize },
        );
      })
    );
  });

  const idParamSchema = z.object({ id: z.string().uuid() });

  // ── POST /api/v1/admin/system/dlq/:id/retry ───────────────────────────────
  fastify.post(
    '/api/v1/admin/system/dlq/:id/retry',
    { preHandler: [requireSuperAdmin] },
    async (request) => {
      const { id } = parseOrThrow(idParamSchema, request.params);

      await withCoreDb((prisma) => retryDlqEntry(prisma, id));
      return { status: 'retried' };
    }
  );

  // ── POST /api/v1/admin/system/dlq/:id/dismiss ─────────────────────────────
  fastify.post(
    '/api/v1/admin/system/dlq/:id/dismiss',
    { preHandler: [requireSuperAdmin] },
    async (request) => {
      const { id } = parseOrThrow(idParamSchema, request.params);

      await withCoreDb((prisma) => dismissDlqEntry(prisma, id));
      return { status: 'dismissed' };
    }
  );
}
