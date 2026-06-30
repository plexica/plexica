// routes/marketplace.routes.ts
// Tenant-facing marketplace + installed plugin listing endpoints (Spec 004).
// Fills the gaps left by the frontend plugin-api client.

import { z } from 'zod';
import { withCoreDb, withTenantDb } from '../../../lib/tenant-database.js';
import { requireAbac } from '../../../middleware/abac.js';
import { PluginNotFoundError } from '../errors.js';
import { manifestSchema } from '../schema/manifest.js';

import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';

const SLUG_REGEX = /^[a-z][a-z0-9-]{1,62}$/;

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  category: z.string().optional(),
});

export async function marketplaceRoutes(fastify: FastifyInstance): Promise<void> {
  // ── GET /api/v1/plugins/installed ──────────────────────────────────────────
  // Registered before /:slug so the static segment wins over the parametric one.
  fastify.get(
    '/api/v1/plugins/installed',
    { preHandler: [requireAbac('plugin:manage')] },
    async (request) => {
      const ctx = request.tenantContext;

      const installations = await withTenantDb(async (tx: any) => {
        return tx.pluginInstallation.findMany({
          where: { tenantSlug: ctx.slug, status: { not: 'uninstalled' } },
          orderBy: { installedAt: 'desc' },
        });
      }, ctx);

      if (installations.length === 0) return [];

      const pluginIds: string[] = Array.from(new Set(installations.map((i: any) => i.pluginId as string)));
      const plugins = await withCoreDb((prisma: PrismaClient) =>
        prisma.plugin.findMany({
          where: { id: { in: pluginIds } },
          select: { id: true, slug: true, name: true, version: true },
        })
      );
      const pluginMap = new Map(plugins.map((p: any) => [p.id as string, p]));

      return installations.map((inst: any) => ({
        ...inst,
        pluginName: pluginMap.get(inst.pluginId)?.name ?? null,
        pluginSlug: pluginMap.get(inst.pluginId)?.slug ?? null,
      }));
    }
  );

  // ── GET /api/v1/plugins ────────────────────────────────────────────────────
  fastify.get(
    '/api/v1/plugins',
    { preHandler: [requireAbac('plugin:manage')] },
    async (request) => {
      const parsed = listQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return { data: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };
      }
      const { page, pageSize, search, category } = parsed.data;

      const where: Record<string, unknown> = { status: 'published' };
      if (search) where.slug = { contains: search, mode: 'insensitive' };
      if (category) where.categories = { has: category };

      return withCoreDb((prisma: PrismaClient) =>
        (prisma as any).$transaction(async (tx: any) => {
          const [data, total] = await Promise.all([
            tx.plugin.findMany({
              where,
              skip: (page - 1) * pageSize,
              take: pageSize,
              orderBy: { createdAt: 'desc' },
            }),
            tx.plugin.count({ where }),
          ]);
          return {
            data,
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize),
          };
        })
      );
    }
  );

  // ── GET /api/v1/plugins/:slug ──────────────────────────────────────────────
  fastify.get(
    '/api/v1/plugins/:slug',
    { preHandler: [requireAbac('plugin:manage')] },
    async (request) => {
      const { slug } = z.object({ slug: z.string().regex(SLUG_REGEX) }).parse(request.params);

      const plugin = await withCoreDb((prisma: PrismaClient) =>
        prisma.plugin.findUnique({ where: { slug } })
      );

      if (!plugin || plugin.status !== 'published') throw new PluginNotFoundError(slug);

      const manifest = manifestSchema.safeParse(plugin.manifest as Record<string, unknown>);
      return {
        ...plugin,
        actions: manifest.success ? (manifest.data.actions ?? []) : [],
        declaredTables: manifest.success ? manifest.data.declaredTables : [],
        declaredEvents: manifest.success ? (manifest.data.events?.subscribes ?? []) : [],
      };
    }
  );
}
