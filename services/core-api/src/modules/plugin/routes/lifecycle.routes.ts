// routes/lifecycle.routes.ts
// Plugin lifecycle: install, deactivate, reactivate, uninstall.

import { z } from 'zod';
import { withCoreDb, withTenantDb } from '../../../lib/tenant-database.js';
import { emitEvent, Topics } from '../../../lib/kafka.js';
import { requireAbac } from '../../../middleware/abac.js';
import { PluginNotFoundError, PluginValidationError } from '../errors.js';
import { createContainerManager } from '../services/container-manager.service.js';
import { resumeConsumerGroup, pauseConsumerGroup, deleteConsumerGroup } from '../events/consumer-manager.service.js';
import { resetBreaker } from '../services/health-check.service.js';
import { validateManifest } from '../services/manifest-validator.service.js';

import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';

const SAFE_IDENTIFIER = /^[a-z][a-z0-9_]{0,62}$/i;

export async function lifecycleRoutes(fastify: FastifyInstance): Promise<void> {
  // ── POST /api/v1/plugins/:slug/install ────────────────────────────────────
  fastify.post(
    '/api/v1/plugins/:slug/install',
    { preHandler: [requireAbac('plugin:manage')] },
    async (request) => {
      const { slug } = request.params as { slug: string };
      const ctx = request.tenantContext;
      const userId = request.user.keycloakUserId;

      // Validate plugin exists and is published (core schema)
      const plugin = await withCoreDb(async (prisma: any) =>
        prisma.plugin.findUnique({ where: { slug } })
      ) as { id: string; slug: string; version: string; status: string; manifest: unknown } | null;
      if (!plugin) throw new PluginNotFoundError(slug);
      if (plugin.status !== 'published') {
        throw new PluginValidationError(`Plugin "${slug}" is not published`);
      }

      // Check not already installed (tenant schema)
      const existing = await withTenantDb(async (tx: any) => {
        return tx.pluginInstallation.findUnique({
          where: { pluginId_tenantSlug: { pluginId: plugin.id, tenantSlug: ctx.slug } },
        });
      }, ctx);

      if (existing) {
        throw new PluginValidationError(`Plugin "${slug}" is already installed for this tenant`);
      }

      // Run install flow in tenant transaction
      const install = await withTenantDb(async (tx: any) => {
        // Create installation record
        const installation = await tx.pluginInstallation.create({
          data: {
            pluginId: plugin.id,
            tenantSlug: ctx.slug,
            version: plugin.version,
            status: 'installing',
            hostingType: 'sidecar',
            installedBy: userId,
          },
        });

        // Store migration log for declared tables
        const manifest = plugin.manifest as unknown as Record<string, unknown>;
        const declaredTables: Array<{ name: string; migrationFile: string }> =
          (manifest as any)?.declaredTables ?? [];

        for (const table of declaredTables) {
          await tx.pluginMigrationStatus.create({
            data: {
              installId: installation.id,
              migrationName: table.name,    // Store actual table name, not filename
              status: 'applied',
              appliedAt: new Date(),
            },
          });
        }

        // Register actions
        const actions: Array<{ action: string; defaultRole: string }> =
          (manifest as any)?.actions ?? [];
        for (const a of actions) {
          await tx.actionRegistry.create({
            data: {
              pluginId: plugin.id,
              actionKey: a.action,
              labelI18nKey: a.action.replace(/:/g, '.'),
              defaultRole: a.defaultRole,
            },
          });
        }

        // Mark active
        await tx.pluginInstallation.update({
          where: { id: installation.id },
          data: { status: 'active' },
        });

        return installation;
      }, ctx);

      // Fire-and-forget event
      void emitEvent(Topics.plugin('installed'), { installId: install.id, slug });

      return { status: 'active', installId: install.id, slug };
    }
  );

  // ── POST /api/v1/plugins/:installId/deactivate ────────────────────────────
  fastify.post(
    '/api/v1/plugins/:installId/deactivate',
    { preHandler: [requireAbac('plugin:manage')] },
    async (request) => {
      const { installId } = request.params as { installId: string };
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
    }
  );

  // ── POST /api/v1/plugins/:installId/reactivate ────────────────────────────
  fastify.post(
    '/api/v1/plugins/:installId/reactivate',
    { preHandler: [requireAbac('plugin:manage')] },
    async (request) => {
      const { installId } = request.params as { installId: string };
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
    }
  );

  // ── POST /api/v1/plugins/:installId/uninstall ─────────────────────────────
  fastify.post(
    '/api/v1/plugins/:installId/uninstall',
    { preHandler: [requireAbac('plugin:manage')] },
    async (request) => {
      const { installId } = request.params as { installId: string };
      const ctx = request.tenantContext;

      return withTenantDb(async (tx: any) => {
        const inst = await tx.pluginInstallation.findUnique({
          where: { id: installId },
          include: { migrationLogs: true },
        });
        if (!inst) throw new PluginNotFoundError(`Installation ${installId}`);
        if (inst.status === 'uninstalled') throw new PluginValidationError('Already uninstalled');

        const mgr = createContainerManager(inst.hostingType);
        await mgr.stopContainer(installId);
        await deleteConsumerGroup(installId, inst.tenantSlug);
        await resetBreaker(installId);

        // Drop tables using the stored table name (safe identifier regex)
        for (const log of inst.migrationLogs ?? []) {
          if (log.status === 'applied' && SAFE_IDENTIFIER.test(log.migrationName)) {
            try {
              await tx.$executeRawUnsafe(`DROP TABLE IF EXISTS "${log.migrationName}" CASCADE`);
            } catch { /* table may not exist */ }
          }
        }

        await tx.pluginWorkspaceVisibility.deleteMany({ where: { installId } });
        await tx.pluginInstallation.update({ where: { id: installId }, data: { status: 'uninstalled' } });
        return { status: 'uninstalled', installId };
      }, ctx);
    }
  );
}
