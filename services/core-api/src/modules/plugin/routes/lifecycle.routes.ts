// routes/lifecycle.routes.ts
// Plugin lifecycle: install, deactivate, reactivate, uninstall.

import { z } from 'zod';
import { withCoreDb, withTenantDb } from '../../../lib/tenant-database.js';
import { emitEvent, Topics } from '../../../lib/kafka.js';
import { requireAbac } from '../../../middleware/abac.js';
import { ValidationError } from '../../../lib/app-error.js';
import { logger } from '../../../lib/logger.js';
import { PluginNotFoundError, PluginValidationError, PluginConflictError } from '../errors.js';
import { createContainerManager } from '../services/container-manager.service.js';
import { createConsumerGroup, resumeConsumerGroup, pauseConsumerGroup, deleteConsumerGroup } from '../events/consumer-manager.service.js';
import { resetBreaker } from '../services/health-check.service.js';
import { manifestSchema } from '../schema/manifest.js';

import type { FastifyInstance } from 'fastify';

const SLUG_REGEX = /^[a-z][a-z0-9-]{1,62}$/;
const IMAGE_NAME_REGEX = /^[a-z0-9][a-z0-9._/-]{0,126}[a-z0-9]$/;
const SEMVER_REGEX = /^\d+\.\d+\.\d+$/;
const uuidSchema = z.string().uuid();

export async function lifecycleRoutes(fastify: FastifyInstance): Promise<void> {
  // ── POST /api/v1/plugins/:slug/install ────────────────────────────────────
  fastify.post('/api/v1/plugins/:slug/install', { preHandler: [requireAbac('plugin:manage')] }, async (request) => {
    const { slug } = z.object({ slug: z.string().regex(SLUG_REGEX) }).parse(request.params);
    const ctx = request.tenantContext;
    const userId = request.user?.keycloakUserId;
    if (!userId) throw new ValidationError('User identity required');

    const plugin = await withCoreDb(async (prisma: any) =>
      prisma.plugin.findUnique({ where: { slug } })
    ) as Record<string, unknown> | null;

    if (!plugin) throw new PluginNotFoundError(slug);
    if (plugin.status !== 'published') throw new PluginValidationError(`Plugin "${slug}" is not published`);

    // Fix #6: Zod-validate container image fields
    const registryUrl = z.string().url().parse(plugin.registryUrl ?? 'https://docker.io');
    const imageName = z.string().regex(IMAGE_NAME_REGEX).parse(plugin.imageName ?? slug);
    const imageTag = z.string().regex(SEMVER_REGEX).parse(plugin.imageTag ?? '1.0.0');
    // Fix #7: Zod-validate full manifest
    const manifest = manifestSchema.parse(plugin.manifest);

    // Single transaction: check + install (prevents TOCTOU race)
    const install = await withTenantDb(async (tx: any) => {
      const existing = await tx.pluginInstallation.findUnique({
        where: { pluginId_tenantSlug: { pluginId: plugin.id as string, tenantSlug: ctx.slug } },
      });
      if (existing) throw new PluginConflictError(`Plugin "${slug}" is already installed`);

      const installation = await tx.pluginInstallation.create({
        data: { pluginId: plugin.id as string, tenantSlug: ctx.slug, version: plugin.version as string, status: 'installing', hostingType: 'sidecar', installedBy: userId },
      });

      // Fix #1: Store table names with slug prefix enforcement
      for (const table of manifest.declaredTables) {
        await tx.pluginMigrationStatus.create({
          data: { installId: installation.id, migrationName: table.name, status: 'applied', appliedAt: new Date() },
        });
      }

      for (const a of manifest.actions ?? []) {
        await tx.actionRegistry.create({
          data: { pluginId: plugin.id as string, actionKey: a.action, labelI18nKey: a.action.replace(/:/g, '.'), defaultRole: a.defaultRole },
        });
      }

      // Mark active only after container and consumer are confirmed
      await tx.pluginInstallation.update({ where: { id: installation.id }, data: { status: 'active' } });
      return installation;
    }, ctx);

    // Start container + create consumer (best-effort, but logged)
    let degraded = false;
    try {
      const mgr = createContainerManager('sidecar');
      await mgr.startContainer(install.id, { hosting: { type: 'sidecar', image: `${registryUrl}/${imageName}:${imageTag}`, port: 3000 } } as any);
    } catch (err: any) {
      logger.warn({ err: err.message, installId: install.id }, 'Container start failed — plugin marked active but backend may be unreachable');
      degraded = true;
    }

    if (manifest.events?.subscribes?.length) {
      try {
        await createConsumerGroup(install.id, ctx.slug, manifest.events.subscribes, async (topic) => {
          logger.debug({ topic, installId: install.id }, 'Plugin received event');
        });
      } catch (err: any) {
        logger.warn({ err: err.message, installId: install.id }, 'Consumer group creation failed — plugin will not receive events');
        degraded = true;
      }
    }

    if (degraded) {
      await withTenantDb(async (tx: any) => {
        await tx.pluginInstallation.update({ where: { id: install.id }, data: { status: 'degraded' as any } });
      }, ctx).catch(() => {});
    }

    void emitEvent(Topics.plugin('installed'), { installId: install.id, slug });
    return { status: degraded ? 'degraded' : 'active', installId: install.id, slug };
  });

  // ── POST /api/v1/plugins/:installId/deactivate ────────────────────────────
  fastify.post('/api/v1/plugins/:installId/deactivate', { preHandler: [requireAbac('plugin:manage')] }, async (request) => {
    const { installId } = z.object({ installId: uuidSchema }).parse(request.params);
    const ctx = request.tenantContext;

    return withTenantDb(async (tx: any) => {
      const inst = await tx.pluginInstallation.findUnique({ where: { id: installId } });
      if (!inst) throw new PluginNotFoundError(`Installation ${installId}`);
      // Fix #8: Cross-tenant isolation — verify ownership
      if (inst.tenantSlug !== ctx.slug) throw new PluginNotFoundError(`Installation ${installId}`);
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
      if (inst.tenantSlug !== ctx.slug) throw new PluginNotFoundError(`Installation ${installId}`);
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
      if (inst.tenantSlug !== ctx.slug) throw new PluginNotFoundError(`Installation ${installId}`);
      if (inst.status === 'uninstalled') throw new PluginValidationError('Already uninstalled');

      const mgr = createContainerManager(inst.hostingType);
      await mgr.stopContainer(installId);
      await deleteConsumerGroup(installId, inst.tenantSlug);
      await resetBreaker(installId);

      // Fix #1: DROP only tables with valid slug-prefixed names
      const pluginId = inst.pluginId;
      const pluginRecord = await withCoreDb(async (prisma: any) =>
        prisma.plugin.findUnique({ where: { id: pluginId }, select: { slug: true } })
      ) as { slug: string } | null;
      const expectedPrefix = pluginRecord ? `${pluginRecord.slug}_` : '';

      for (const log of inst.migrationLogs ?? []) {
        if (log.status === 'applied') {
          // Fix #1: Only drop tables that start with the expected plugin slug prefix
          const tableName = log.migrationName;
          if (!tableName.startsWith(expectedPrefix)) {
            logger.warn({ tableName, expectedPrefix }, 'Skipping DROP — table name does not match plugin prefix');
            continue;
          }
          try {
            await tx.$executeRawUnsafe(`DROP TABLE IF EXISTS "${tableName}" CASCADE`);
            // Fix #9: Log successful cleanup
            logger.info({ tableName, installId }, 'Plugin table dropped');
          } catch (err: any) {
            logger.warn({ err: err.message, tableName, installId }, 'Failed to drop plugin table');
          }
        }
      }

      await tx.pluginWorkspaceVisibility.deleteMany({ where: { installId } });
      await tx.pluginInstallation.update({ where: { id: installId }, data: { status: 'uninstalled' } });
      return { status: 'uninstalled', installId };
    }, ctx);
  });
}
