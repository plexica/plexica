// routes/marketplace.routes.ts
// Tenant-facing marketplace + installed plugin listing endpoints (Spec 004).
// Fills the gaps left by the frontend plugin-api client.

import { z } from 'zod';

import { withCoreDb, withTenantDb } from '../../../lib/tenant-database.js';
import { requireAbac } from '../../../middleware/abac.js';
import { ForbiddenError } from '../../../lib/app-error.js';
import { getPresignedReadUrl } from '../../../lib/minio-client.js';
import { PluginNotFoundError } from '../errors.js';
import { manifestSchema } from '../schema/manifest.js';
import { getDevBackendForInstallation } from '../services/dev-backends.js';
import { isPluginVisible } from '../services/visibility.service.js';

import type { FastifyInstance } from 'fastify';
import type { TenantPrismaClient } from '../../../lib/tenant-database.js';

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

      const installations = await withTenantDb(async (tx: TenantPrismaClient) => {
        return tx.pluginInstallation.findMany({
          where: { tenantSlug: ctx.slug, status: { not: 'uninstalled' } },
          orderBy: { installedAt: 'desc' },
        });
      }, ctx);

      if (installations.length === 0) return [];

      const pluginIds: string[] = Array.from(
        new Set(installations.map((i: Record<string, unknown>) => i.pluginId as string))
      );
      const plugins = await withCoreDb((prisma) =>
        prisma.plugin.findMany({
          where: { id: { in: pluginIds } },
          select: { id: true, slug: true, name: true, version: true },
        })
      );
      const pluginMap = new Map(plugins.map((p: Record<string, unknown>) => [p.id as string, p]));

      return installations.map((inst: Record<string, unknown>) => {
        const plugin = pluginMap.get(inst.pluginId as string);
        return {
          ...inst,
          // Frontend PluginInstallation type uses `name`/`slug`; raw E2E
          // assertions (ac-04) use `pluginName`/`pluginSlug` — expose both.
          name: plugin?.name ?? null,
          slug: plugin?.slug ?? null,
          pluginName: plugin?.name ?? null,
          pluginSlug: plugin?.slug ?? null,
        };
      });
    }
  );

  // Active, visible Module Federation entries for one workspace.
  fastify.get('/api/v1/plugins/workspace/:workspaceId', async (request) => {
    const { workspaceId } = z.object({ workspaceId: z.string().uuid() }).parse(request.params);
    const ctx = request.tenantContext;
    const isTenantAdmin = request.user.roles.includes('tenant_admin');
    const installations = await withTenantDb(async (tx: TenantPrismaClient) => {
      const workspace = await tx.workspace.findFirst({
        where: { id: workspaceId, status: 'active' },
        select: { id: true },
      });
      if (!workspace) throw new ForbiddenError('Active workspace required');
      if (!isTenantAdmin) {
        const membership = await tx.workspaceMember.findUnique({
          where: { workspaceId_userId: { workspaceId, userId: request.user.id } },
          select: { id: true },
        });
        if (!membership) throw new ForbiddenError('Workspace membership required');
      }
      const candidates = await tx.pluginInstallation.findMany({
        where: { tenantSlug: ctx.slug, status: 'active' },
      });
      const visible = await Promise.all(
        candidates.map(async (item) =>
          // Generated tenant transaction type is compatible at runtime.
          (await isPluginVisible(tx as never, item.id, workspaceId)) ? item : null
        )
      );
      return visible.filter((item): item is NonNullable<typeof item> => item !== null);
    }, ctx);

    const plugins = await withCoreDb((db) =>
      db.plugin.findMany({
        where: { id: { in: installations.map((item) => item.pluginId) } },
        select: { id: true, slug: true, version: true, manifest: true },
      })
    );
    const byId = new Map(plugins.map((plugin) => [plugin.id, plugin]));
    return Promise.all(
      installations.flatMap((installation) => {
        const plugin = byId.get(installation.pluginId);
        const parsed = manifestSchema.safeParse(plugin?.manifest);
        if (!plugin || !parsed.success || !parsed.data.ui) return [];
        const ui = parsed.data.ui;
        const dev = getDevBackendForInstallation(plugin.slug, installation.id);
        const points = dev?.extensionPoints ?? ui.extensionPoints;
        return points.map(async (extensionPoint) => ({
          installId: installation.id,
          slug: plugin.slug,
          extensionPoint,
          remoteEntryUrl:
            dev?.uiUrl ??
            (await getPresignedReadUrl(
              'plugin-assets',
              `plugins/${plugin.slug}/${plugin.version}/${ui.remoteEntry}`
            )),
        }));
      })
    );
  });

  // ── GET /api/v1/plugins ────────────────────────────────────────────────────
  // Read-only catalog browsing — available to any authenticated tenant member
  // (viewers can browse; the frontend disables the install button for non-admins
  // via useAbac). Install/uninstall still require plugin:manage.
  fastify.get('/api/v1/plugins', async (request) => {
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return { data: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };
    }
    const { page, pageSize, search, category } = parsed.data;
    const installedIds = new Set(
      await withTenantDb(async (database) => {
        const rows = await database.pluginInstallation.findMany({
          where: { tenantSlug: request.tenantContext.slug, status: { not: 'uninstalled' } },
          select: { pluginId: true },
        });
        return rows.map((row) => row.pluginId);
      }, request.tenantContext)
    );
    const where: Record<string, unknown> = { status: 'published' };
    if (search) where.slug = { contains: search, mode: 'insensitive' };
    if (category) where.categories = { array_contains: [category] };

    return withCoreDb((prisma) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
          data: data.map((plugin: { id: string }) => ({
            ...plugin,
            isInstalled: installedIds.has(plugin.id),
            installCount: installedIds.has(plugin.id) ? 1 : 0,
          })),
          total,
          page,
          pageSize,
          totalPages: Math.ceil(total / pageSize),
        };
      })
    );
  });

  // ── GET /api/v1/plugins/:slug ──────────────────────────────────────────────
  fastify.get('/api/v1/plugins/:slug', async (request) => {
    const { slug } = z.object({ slug: z.string().regex(SLUG_REGEX) }).parse(request.params);

    const plugin = await withCoreDb((prisma) => prisma.plugin.findUnique({ where: { slug } }));

    if (!plugin || plugin.status !== 'published') throw new PluginNotFoundError(slug);

    const manifest = manifestSchema.safeParse(plugin.manifest as unknown);
    return {
      ...plugin,
      actions: manifest.success ? (manifest.data.actions ?? []) : [],
      declaredTables: manifest.success ? manifest.data.declaredTables : [],
      declaredEvents: manifest.success ? (manifest.data.events?.subscribes ?? []) : [],
    };
  });
}
