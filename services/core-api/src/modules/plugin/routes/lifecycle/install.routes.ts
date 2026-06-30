// routes/lifecycle/install.routes.ts
// Plugin install route with migration execution.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { withCoreDb, withTenantDb } from '../../../../lib/tenant-database.js';
import { emitEvent, Topics } from '../../../../lib/kafka.js';
import { requireAbac } from '../../../../middleware/abac.js';
import { ValidationError } from '../../../../lib/app-error.js';
import { logger } from '../../../../lib/logger.js';
import { PluginNotFoundError, PluginValidationError, PluginConflictError, PluginInstallError } from '../../errors.js';
import { createContainerManager } from '../../services/container-manager.service.js';
import { createConsumerGroup } from '../../events/consumer-manager.service.js';
import { manifestSchema } from '../../schema/manifest.js';
import { validateMigrationSql } from '../../schema/migrations.js';

import type { FastifyInstance } from 'fastify';

const SLUG_REGEX = /^[a-z][a-z0-9-]{1,62}$/;
const IMAGE_NAME_REGEX = /^[a-z0-9][a-z0-9._/-]{0,126}[a-z0-9]$/;
const SEMVER_REGEX = /^\d+\.\d+\.\d+$/;

export async function installRoutes(fastify: FastifyInstance): Promise<void> {
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

    const registryUrl = z.string().url().parse(plugin.registryUrl);
    const imageName = z.string().regex(IMAGE_NAME_REGEX).parse(plugin.imageName);
    const imageTag = z.string().regex(SEMVER_REGEX).parse(plugin.imageTag);
    const manifest = manifestSchema.parse(plugin.manifest);

    const install = await withTenantDb(async (tx: any) => {
      const existing = await tx.pluginInstallation.findUnique({
        where: { pluginId_tenantSlug: { pluginId: plugin.id as string, tenantSlug: ctx.slug } },
      });
      if (existing) throw new PluginConflictError(`Plugin "${slug}" is already installed`);

      const installation = await tx.pluginInstallation.create({
        data: { pluginId: plugin.id as string, tenantSlug: ctx.slug, version: plugin.version as string, status: 'installing', hostingType: 'sidecar', installedBy: userId },
      });

      for (const table of manifest.declaredTables) {
        const migrationPath = path.resolve(process.cwd(), 'plugins', manifest.slug, table.migrationFile);
        let sql: string;
        try {
          sql = await readFile(migrationPath, 'utf-8');
        } catch (err: any) {
          throw new PluginInstallError(`Migration file "${table.migrationFile}" not found for plugin "${manifest.slug}" at ${migrationPath}`);
        }

        const validation = validateMigrationSql(sql);
        if (!validation.valid) {
          throw new PluginValidationError(`Migration "${table.migrationFile}" failed validation: ${validation.errors.join('; ')}`);
        }

        try {
          await tx.$executeRawUnsafe(sql);
        } catch (err: any) {
          throw new PluginInstallError(`Failed to execute migration "${table.migrationFile}": ${err.message}`);
        }

        await tx.pluginMigrationStatus.create({
          data: { installId: installation.id, migrationName: table.name, status: 'applied', appliedAt: new Date() },
        });
      }

      for (const a of manifest.actions ?? []) {
        await tx.actionRegistry.create({
          data: { pluginId: plugin.id as string, actionKey: a.action, labelI18nKey: a.action.replace(/:/g, '.'), defaultRole: a.defaultRole },
        });
      }

      return installation;
    }, ctx);

    let degraded = false;
    try {
      const mgr = createContainerManager('sidecar');
      const hostingPort = (manifest.hosting as any)?.port ?? 3000;
      const tenantDbUrl = process.env['DATABASE_URL'] ?? '';
      await mgr.startContainer(install.id, {
        slug, name: slug, version: plugin.version as string, description: '', author: '',
        categories: ['plugin'],
        hosting: { type: 'sidecar' as const, image: `${registryUrl}/${imageName}:${imageTag}`, port: hostingPort },
        declaredTables: [],
        ui: { remoteEntry: 'remoteEntry.js', extensionPoints: [] },
        events: { subscribes: [] },
        env: { DATABASE_URL: tenantDbUrl, CORE_API_URL: 'http://localhost:3001' },
      } as any);
    } catch (err: any) {
      logger.warn({ err: err.message, installId: install.id }, 'Container start failed — plugin will be degraded');
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

    const finalStatus = degraded ? 'degraded' : 'active';
    await withTenantDb(async (tx: any) => {
      await tx.pluginInstallation.update({ where: { id: install.id }, data: { status: finalStatus } });
    }, ctx).catch(() => {});

    emitEvent(Topics.plugin('installed'), { installId: install.id, slug })
      .catch((err: any) => logger.warn({ err: err.message, installId: install.id }, 'Failed to emit install event'));
    return { status: finalStatus, installId: install.id, slug };
  });
}
