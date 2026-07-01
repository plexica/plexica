// routes/lifecycle/install.routes.ts
// Plugin install route with migration execution.

import crypto from 'node:crypto';

import { z } from 'zod';

import { withCoreDb, withTenantDb } from '../../../../lib/tenant-database.js';
import { emitEvent, Topics } from '../../../../lib/kafka.js';
import { requireAbac } from '../../../../middleware/abac.js';
import { ValidationError } from '../../../../lib/app-error.js';
import { logger } from '../../../../lib/logger.js';
import { PluginNotFoundError, PluginValidationError, PluginConflictError } from '../../errors.js';
import { createContainerManager } from '../../services/container-manager.service.js';
import { dispatchEvent } from '../../events/event-dispatcher.service.js';
import { createConsumerGroup } from '../../events/consumer-manager.service.js';
import { createPluginRole, grantCreateOnSchema, revokeCreateOnSchema, dropPluginRole, grantTablePrivileges } from '../../services/db-role.service.js';
import { runPluginMigrations } from '../../services/migration-executor.js';
import { generateServiceToken } from '../../services/service-token.js';
import { manifestSchema } from '../../schema/manifest.js';

import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { TenantPrismaClient } from '../../../../lib/tenant-database.js';

const SLUG_REGEX = /^[a-z][a-z0-9-]{1,62}$/;
const IMAGE_NAME_REGEX = /^[a-z0-9][a-z0-9._/-]{0,126}[a-z0-9]$/;
const SEMVER_REGEX = /^\d+\.\d+\.\d+$/;

/** Terminal statuses that allow re-install over an existing record (A4/EC-29). */
const REINSTALLABLE_STATUSES = new Set(['failed', 'uninstalled']);

/**
 * Pure helper: decides whether an existing installation record blocks
 * re-install. Only active/degraded/deactivated/installing records occupy the
 * (pluginId, tenantSlug) slot legitimately. `failed`/`uninstalled` are
 * terminal and must allow a fresh install. Extracted for unit testing.
 */
export function blocksReInstall(status: string): boolean {
  return !REINSTALLABLE_STATUSES.has(status);
}

export async function installRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/api/v1/plugins/:slug/install', { preHandler: [requireAbac('plugin:manage')] }, async (request) => {
    const { slug } = z.object({ slug: z.string().regex(SLUG_REGEX) }).parse(request.params);
    const ctx = request.tenantContext;
    const userId = request.user?.keycloakUserId;
    if (!userId) throw new ValidationError('User identity required');

    const plugin = await withCoreDb(async (prisma: PrismaClient) =>
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

    const install = await withTenantDb(async (tx: TenantPrismaClient) => {
      const existing = await tx.pluginInstallation.findUnique({
        where: { pluginId_tenantSlug: { pluginId: plugin.id as string, tenantSlug: ctx.slug } },
      });
      // A4/EC-29: a prior `failed` or `uninstalled` install must NOT block
      // re-install. Only active/degraded/deactivated/installing records block.
      if (existing && blocksReInstall(existing.status)) {
        throw new PluginConflictError(`Plugin "${slug}" is already installed`);
      }
      if (existing) {
        // Re-install over a terminal record: drop the old restricted DB role
        // and remove any leftover container (best-effort) so startContainer
        // doesn't 409 on a stale stopped container with the same name.
        try { await dropPluginRole(existing.id, ctx.slug); } catch { /* best-effort */ }
        try { await createContainerManager(existing.hostingType).removeContainer(existing.id); } catch { /* best-effort */ }
        const updated = await tx.pluginInstallation.update({
          where: { id: existing.id },
          data: { status: 'installing', version: plugin.version as string, hostingType, installedBy: userId, installedAt: new Date() },
        });
        return updated;
      }

      const installation = await tx.pluginInstallation.create({
        data: { pluginId: plugin.id as string, tenantSlug: ctx.slug, version: plugin.version as string, status: 'installing', hostingType, installedBy: userId },
      });

      return installation;
    }, ctx);

    // CRITICAL #1 — provision a restricted DB role for the plugin container.
    const role = await createPluginRole(install.id, ctx.slug, manifest.declaredTables);
    // Persist the encrypted connection string at rest in plugin_container_config
    // (a TENANT-schema table — must use withTenantDb, not the core prisma client).
    await withTenantDb(async (tx: TenantPrismaClient) => {
      await tx.pluginContainerConfig.upsert({
        where: { installId: install.id },
        create: { installId: install.id, image: imageRef, port: 0, envOverrides: role.encryptedEnvOverrides },
        update: { envOverrides: role.encryptedEnvOverrides },
      });
    }, ctx).catch((err: unknown) => {
      logger.warn({ err: (err as Error)?.message, installId: install.id }, 'Failed to persist encrypted plugin env overrides');
    });

    // CRITICAL #2 — run declared migrations under SET ROLE plugin_{installId}
    // so PostgreSQL enforces schema/table scope. The role gets CREATE on the
    // tenant schema only for the duration of the migration loop.
    await grantCreateOnSchema(install.id, ctx.slug);
    try {
      await withTenantDb(async (tenantDb) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (tenantDb as any).$transaction(async (tx: any) => {
          await runPluginMigrations({ tx, manifest, role, installId: install.id, pluginId: plugin.id as string });
        });
      }, ctx);
    } catch (migrationErr) {
      // A4: a failed migration must NOT leave an orphaned `installing` record —
      // it would block re-install (409 "already installed") and violate EC-3/EC-29.
      // Mark the install `failed` best-effort and drop the provisioned role.
      logger.error({ err: (migrationErr as Error).message, installId: install.id }, 'Plugin migration failed — marking install failed');
      await withTenantDb(async (tx) => {
        await tx.pluginInstallation.update({ where: { id: install.id }, data: { status: 'failed' } });
      }, ctx).catch((e: unknown) => logger.error({ err: (e as Error)?.message, installId: install.id }, 'Failed to mark install as failed'));
      try { await revokeCreateOnSchema(install.id, ctx.slug); } catch { /* best-effort */ }
      // Drop the orphaned restricted DB role (best-effort) so its password
      // doesn't leak — the failed install will be re-installed with a fresh role.
      try { await dropPluginRole(install.id, ctx.slug); } catch { /* best-effort */ }
      throw migrationErr;
    } finally {
      try { await revokeCreateOnSchema(install.id, ctx.slug); } catch { /* best-effort if not already revoked */ }
    }

    let degraded = false;

    // Grant DML on the now-created plugin tables to the restricted role. This
    // MUST run after runPluginMigrations — granting before table creation throws.
    try {
      await grantTablePrivileges(install.id, ctx.slug, manifest.declaredTables);
    } catch (err: unknown) {
      logger.warn({ err: (err as Error).message, installId: install.id }, 'Failed to grant DML on plugin tables — plugin may not be able to read/write its tables');
      degraded = true;
    }

    try {
      const mgr = createContainerManager(hostingType);
      const hostingPort = (manifest.hosting as { port?: number })?.port ?? 3000;
      // CRITICAL #1 — pass the restricted role's connection string, NOT the
      // platform DATABASE_URL. The container can only touch its declared tables.
      await mgr.startContainer(install.id, {
        slug, name: slug, version: plugin.version as string, description: '', author: '',
        categories: ['plugin'],
        hosting: { type: hostingType, image: imageRef, port: hostingPort },
        declaredTables: [],
        ui: { remoteEntry: 'remoteEntry.js', extensionPoints: [] },
        events: { subscribes: [] },
        env: {
          DATABASE_URL: role.connectionString,
          CORE_API_URL: 'http://localhost:3001',
          // A5: service-account token so the plugin backend can emit events
          // via POST /api/v1/events/emit without a user JWT.
          PLEXICA_SERVICE_TOKEN: generateServiceToken(install.id, ctx.slug),
          PLEXICA_INSTALL_ID: install.id,
        },
      } as any); // eslint-disable-line @typescript-eslint/no-explicit-any
    } catch (err: unknown) {
      logger.warn({ err: (err as Error).message, installId: install.id }, 'Container start failed — plugin will be degraded');
      degraded = true;
    }

    if (manifest.events?.subscribes?.length) {
      try {
        await createConsumerGroup(install.id, ctx.slug, manifest.events.subscribes, async (topic, payload) => {
          try {
            const mgr = createContainerManager(hostingType);
            const backendUrl = await mgr.getContainerUrl(install.id);
            await dispatchEvent(backendUrl, topic, payload, crypto.randomUUID(), install.id);
          } catch (err: unknown) {
            logger.warn({ err: (err as Error).message, installId: install.id, topic }, 'Failed to forward event to plugin backend');
          }
        }, plugin.id as string);
      } catch (err: unknown) {
        logger.warn({ err: (err as Error).message, installId: install.id }, 'Consumer group creation failed — plugin will not receive events');
        degraded = true;
      }
    }

    const finalStatus = degraded ? 'degraded' : 'active';
    await withTenantDb(async (tx: TenantPrismaClient) => {
      await tx.pluginInstallation.update({ where: { id: install.id }, data: { status: finalStatus } });
    }, ctx).catch((err: unknown) => {
      logger.error({ err: (err as Error)?.message ?? err, installId: install.id, finalStatus }, 'Failed to persist final install status');
    });

    emitEvent(Topics.plugin('installed'), { installId: install.id, slug })
      .catch((err: unknown) => logger.warn({ err: (err as Error).message, installId: install.id }, 'Failed to emit install event'));
    return { status: finalStatus, installId: install.id, slug };
  });
}
