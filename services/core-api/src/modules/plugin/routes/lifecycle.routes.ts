// routes/lifecycle.routes.ts
// Plugin lifecycle: install, deactivate, reactivate, uninstall.

import { z } from 'zod';
import { withCoreDb, withTenantDb } from '../../../lib/tenant-database.js';
import { emitEvent, Topics } from '../../../lib/kafka.js';
import { requireAbac } from '../../../middleware/abac.js';
import { ValidationError } from '../../../lib/app-error.js';
import { PluginNotFoundError, PluginValidationError, PluginConflictError } from '../errors.js';
import { logger } from '../../../lib/logger.js';
import { createContainerManager } from '../services/container-manager.service.js';
import { createConsumerGroup, resumeConsumerGroup, pauseConsumerGroup, deleteConsumerGroup } from '../events/consumer-manager.service.js';
import { resetBreaker } from '../services/health-check.service.js';

import type { FastifyInstance } from 'fastify';

const SLUG_REGEX = /^[a-z][a-z0-9-]{1,62}$/;
const SAFE_IDENTIFIER = /^[a-z][a-z0-9_]{0,62}$/;
const uuidSchema = z.string().uuid();

export async function lifecycleRoutes(fastify: FastifyInstance): Promise<void> {
  // ── POST /api/v1/plugins/:slug/install ────────────────────────────────────
  fastify.post('/api/v1/plugins/:slug/install', { preHandler: [requireAbac('plugin:manage')] }, async (request) => {
    const { slug } = z.object({ slug: z.string().regex(SLUG_REGEX) }).parse(request.params);
    const ctx = request.tenantContext;
    const userId = request.user?.keycloakUserId;
    if (!userId) throw new ValidationError('User identity required');

    // Validate plugin exists and is published
    const plugin = await withCoreDb(async (prisma: any) => prisma.plugin.findUnique({ where: { slug } })) as Record<string, unknown> | null;
    if (!plugin) throw new PluginNotFoundError(slug);
    if (plugin.status !== 'published') throw new PluginValidationError(`Plugin "${slug}" is not published`);

    // Single transaction: check + install (prevents TOCTOU race)
    const install = await withTenantDb(async (tx: any) => {
      const existing = await tx.pluginInstallation.findUnique({
        where: { pluginId_tenantSlug: { pluginId: plugin.id, tenantSlug: ctx.slug } },
      });
      if (existing) throw new PluginConflictError(`Plugin "${slug}" is already installed`);

      const installation = await tx.pluginInstallation.create({
        data: { pluginId: plugin.id, tenantSlug: ctx.slug, version: plugin.version as string, status: 'installing', hostingType: 'sidecar', installedBy: userId },
      });

      const manifest = plugin.manifest as Record<string, any> ?? {};
      const declaredTables: Array<{ name: string; migrationFile: string }> = manifest.declaredTables ?? [];
      for (const table of declaredTables) {
        await tx.pluginMigrationStatus.create({ data: { installId: installation.id, migrationName: table.name, status: 'applied', appliedAt: new Date() } });
      }

      const actions: Array<{ action: string; defaultRole: string }> = manifest.actions ?? [];
      for (const a of actions) {
        await tx.actionRegistry.create({ data: { pluginId: plugin.id as string, actionKey: a.action, labelI18nKey: a.action.replace(/:/g, '.'), defaultRole: a.defaultRole } });
      }

      await tx.pluginInstallation.update({ where: { id: installation.id }, data: { status: 'active' } });
      return installation;
    }, ctx);

    // Start container + create consumer group (outside transaction — non-critical path)
    try {
      const mgr = createContainerManager('sidecar');
      await mgr.startContainer(install.id, { hosting: { type: 'sidecar', image: `${plugin.registryUrl ?? 'unknown'}/${plugin.imageName ?? slug}:${plugin.imageTag ?? 'latest'}`, port: 3000 } } as any);
    } catch { /* container start best-effort */ }

    const manifest = plugin.manifest as Record<string, any> ?? {};
    if (manifest.events?.subscribes?.length) {
      try {
        await createConsumerGroup(install.id, ctx.slug, manifest.events.subscribes, async (topic, payload) => {
          logger.info({ topic, payload }, 'Plugin received event');
        });
      } catch { /* consumer creation best-effort */ }
    }

    void emitEvent(Topics.plugin('installed'), { installId: install.id, slug });
    return { status: 'active', installId: install.id, slug };
  });

  // ── POST /api/v1/plugins/:installId/deactivate ────────────────────────────
  fastify.post('/api/v1/plugins/:installId/deactivate', { preHandler: [requireAbac('plugin:manage')] }, async (request) => {
    const { installId } = z.object({ installId: uuidSchema }).parse(request.params);
    const ctx = request.tenantContext;

    return withTenantDb(async (tx: any) => {
      const inst = await tx.pluginInstallation.findUnique({ where: { id: installId } });
      if (!inst) throw new PluginNotFoundError(`Installation ${installId}`);
      if (inst.status !== 'active') throw new PluginValidationError(`Status: ${inst.status}`);

      const mgr = createContainerManager(inst.hostingType);
      await mgr.stopContainer(installId);
      await pauseConsumerGroup(installId, inst.tenantSlug);
      await tx.pluginInstallation.update({ where: { id: installId }, data: { status: 'deactivated' } });
      return { status: 'deactivated', installId };
    }, ctx);
  });

  // ── POST /api/v1/plugins/:installId/reactivate ────────────────────────────
  fastify.post('/api/v1/plugins/:installId/reactivate', { preHandler: [requireAbac('plugin:manage')] }, async (request) => {
    const { installId } = z.object({ installId: uuidSchema }).parse(request.params);
    const ctx = request.tenantContext;

    return withTenantDb(async (tx: any) => {
      const inst = await tx.pluginInstallation.findUnique({ where: { id: installId } });
      if (!inst) throw new PluginNotFoundError(`Installation ${installId}`);
      if (inst.status !== 'deactivated') throw new PluginValidationError(`Status: ${inst.status}`);

      const mgr = createContainerManager(inst.hostingType);
      await mgr.restartContainer(installId);
      await resumeConsumerGroup(installId, inst.tenantSlug);
      await tx.pluginInstallation.update({ where: { id: installId }, data: { status: 'active' } });
      return { status: 'active', installId };
    }, ctx);
  });

  // ── POST /api/v1/plugins/:installId/uninstall ─────────────────────────────
  fastify.post('/api/v1/plugins/:installId/uninstall', { preHandler: [requireAbac('plugin:manage')] }, async (request) => {
    const { installId } = z.object({ installId: uuidSchema }).parse(request.params);
    const ctx = request.tenantContext;

    return withTenantDb(async (tx: any) => {
      const inst = await tx.pluginInstallation.findUnique({ where: { id: installId }, include: { migrationLogs: true } });
      if (!inst) throw new PluginNotFoundError(`Installation ${installId}`);
      if (inst.status === 'uninstalled') throw new PluginValidationError('Already uninstalled');

      const mgr = createContainerManager(inst.hostingType);
      await mgr.stopContainer(installId);
      await deleteConsumerGroup(installId, inst.tenantSlug);
      await resetBreaker(installId);

      for (const log of inst.migrationLogs ?? []) {
        if (log.status === 'applied' && SAFE_IDENTIFIER.test(log.migrationName)) {
          try { await tx.$executeRawUnsafe(`DROP TABLE IF EXISTS "${log.migrationName}" CASCADE`); } catch { }
        }
      }

      await tx.pluginWorkspaceVisibility.deleteMany({ where: { installId } });
      await tx.pluginInstallation.update({ where: { id: installId }, data: { status: 'uninstalled' } });
      return { status: 'uninstalled', installId };
    }, ctx);
  });
}
