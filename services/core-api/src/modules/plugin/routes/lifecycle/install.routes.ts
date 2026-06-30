// routes/lifecycle/install.routes.ts
// Plugin install route with migration execution.

import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { withCoreDb, withTenantDb } from '../../../../lib/tenant-database.js';
import { emitEvent, Topics } from '../../../../lib/kafka.js';
import { requireAbac } from '../../../../middleware/abac.js';
import { ValidationError } from '../../../../lib/app-error.js';
import { logger } from '../../../../lib/logger.js';
import { prisma } from '../../../../lib/database.js';
import { PluginNotFoundError, PluginValidationError, PluginConflictError, PluginInstallError } from '../../errors.js';
import { createContainerManager } from '../../services/container-manager.service.js';
import { dispatchEvent } from '../../events/event-dispatcher.service.js';
import { createConsumerGroup } from '../../events/consumer-manager.service.js';
import { createPluginRole, grantCreateOnSchema, revokeCreateOnSchema } from '../../services/db-role.service.js';
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

    // Strip URL scheme from registry host to build the image ref.
    const registryHost = (() => {
      try { return new URL(registryUrl).host; } catch { return registryUrl.replace(/^https?:\/\//, ''); }
    })();
    const imageRef = `${registryHost}/${imageName}:${imageTag}`;
    const hostingType = manifest.hosting.type;

    const install = await withTenantDb(async (tx: any) => {
      const existing = await tx.pluginInstallation.findUnique({
        where: { pluginId_tenantSlug: { pluginId: plugin.id as string, tenantSlug: ctx.slug } },
      });
      if (existing) throw new PluginConflictError(`Plugin "${slug}" is already installed`);

      const installation = await tx.pluginInstallation.create({
        data: { pluginId: plugin.id as string, tenantSlug: ctx.slug, version: plugin.version as string, status: 'installing', hostingType, installedBy: userId },
      });

      return installation;
    }, ctx);

    // CRITICAL #1 — provision a restricted DB role for the plugin container.
    const role = await createPluginRole(install.id, ctx.slug, manifest.declaredTables);
    // Persist the encrypted connection string at rest in plugin_container_config.
    await (prisma as any).pluginContainerConfig.upsert({
      where: { installId: install.id },
      create: { installId: install.id, image: imageRef, port: 0, envOverrides: role.encryptedEnvOverrides },
      update: { envOverrides: role.encryptedEnvOverrides },
    }).catch((err: any) => {
      logger.warn({ err: err?.message, installId: install.id }, 'Failed to persist encrypted plugin env overrides');
    });

    // CRITICAL #2 — run declared migrations under SET ROLE plugin_{installId}
    // so PostgreSQL enforces schema/table scope. The role gets CREATE on the
    // tenant schema only for the duration of the migration loop.
    await grantCreateOnSchema(install.id, ctx.slug);
    try {
      await withTenantDb(async (tenantDb: any) => {
        return tenantDb.$transaction(async (tx: any) => {
          for (const table of manifest.declaredTables) {
            let sql: string;
            if (table.content) {
              sql = table.content;
            } else {
              const migrationPath = path.resolve(process.cwd(), 'plugins', manifest.slug, table.migrationFile);
              try {
                sql = await readFile(migrationPath, 'utf-8');
              } catch (err: any) {
                throw new PluginInstallError(`Migration file "${table.migrationFile}" not found for plugin "${manifest.slug}" — provide inline content in manifest.declaredTables[].content`);
              }
            }

            const validation = validateMigrationSql(sql, manifest.slug);
            if (!validation.valid) {
              throw new PluginValidationError(`Migration "${table.migrationFile}" failed validation: ${validation.errors.join('; ')}`);
            }

            try {
              await tx.$executeRawUnsafe(`SET ROLE ${role.roleName}`);
              try {
                await tx.$executeRawUnsafe(sql);
              } finally {
                await tx.$executeRawUnsafe('RESET ROLE');
              }
            } catch (err: any) {
              throw new PluginInstallError(`Failed to execute migration "${table.migrationFile}": ${err.message}`);
            }

            await tx.pluginMigrationStatus.create({
              data: { installId: install.id, migrationName: table.name, status: 'applied', appliedAt: new Date() },
            });
          }

          for (const a of manifest.actions ?? []) {
            await tx.actionRegistry.create({
              data: { pluginId: plugin.id as string, actionKey: a.action, labelI18nKey: a.action.replace(/:/g, '.'), defaultRole: a.defaultRole },
            });
          }
        });
      }, ctx);
    } finally {
      await revokeCreateOnSchema(install.id, ctx.slug);
    }

    let degraded = false;
    try {
      const mgr = createContainerManager(hostingType);
      const hostingPort = (manifest.hosting as any)?.port ?? 3000;
      // CRITICAL #1 — pass the restricted role's connection string, NOT the
      // platform DATABASE_URL. The container can only touch its declared tables.
      await mgr.startContainer(install.id, {
        slug, name: slug, version: plugin.version as string, description: '', author: '',
        categories: ['plugin'],
        hosting: { type: hostingType, image: imageRef, port: hostingPort },
        declaredTables: [],
        ui: { remoteEntry: 'remoteEntry.js', extensionPoints: [] },
        events: { subscribes: [] },
        env: { DATABASE_URL: role.connectionString, CORE_API_URL: 'http://localhost:3001' },
      } as any);
    } catch (err: any) {
      logger.warn({ err: err.message, installId: install.id }, 'Container start failed — plugin will be degraded');
      degraded = true;
    }

    if (manifest.events?.subscribes?.length) {
      try {
        await createConsumerGroup(install.id, ctx.slug, manifest.events.subscribes, async (topic, payload) => {
          try {
            const mgr = createContainerManager(hostingType);
            const backendUrl = await mgr.getContainerUrl(install.id);
            await dispatchEvent(backendUrl, topic, payload, crypto.randomUUID(), install.id);
          } catch (err: any) {
            logger.warn({ err: err.message, installId: install.id, topic }, 'Failed to forward event to plugin backend');
          }
        }, plugin.id as string);
      } catch (err: any) {
        logger.warn({ err: err.message, installId: install.id }, 'Consumer group creation failed — plugin will not receive events');
        degraded = true;
      }
    }

    const finalStatus = degraded ? 'degraded' : 'active';
    await withTenantDb(async (tx: any) => {
      await tx.pluginInstallation.update({ where: { id: install.id }, data: { status: finalStatus } });
    }, ctx).catch((err: any) => {
      logger.error({ err: err?.message ?? err, installId: install.id, finalStatus }, 'Failed to persist final install status');
    });

    emitEvent(Topics.plugin('installed'), { installId: install.id, slug })
      .catch((err: any) => logger.warn({ err: err.message, installId: install.id }, 'Failed to emit install event'));
    return { status: finalStatus, installId: install.id, slug };
  });
}
