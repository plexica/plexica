// routes/lifecycle/install.routes.ts
// Plugin install route with migration execution.

import { z } from 'zod';

import { withCoreDb, withTenantDb } from '../../../../lib/tenant-database.js';
import { buildDomainEvent } from '../../../../events/event-envelope.js';
import { enqueueEvent } from '../../../../events/outbox-repository.js';
import { requireAbac } from '../../../../middleware/abac.js';
import { ValidationError } from '../../../../lib/app-error.js';
import { logger } from '../../../../lib/logger.js';
import { PluginNotFoundError, PluginValidationError } from '../../errors.js';
import { createPluginRole, grantTablePrivileges } from '../../services/db-role.service.js';
import { runPluginMigrations } from '../../services/migration-executor.js';
import {
  cleanupFailedInstallation,
  runMigrationSecurityPhase,
} from '../../services/install-failure.service.js';
import { createInstallationRecord } from '../../services/installation-record.service.js';
import { installPluginRuntime } from '../../services/install-runtime.service.js';
import { manifestSchema } from '../../schema/manifest.js';

import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { TenantPrismaClient } from '../../../../lib/tenant-database.js';

const SLUG_REGEX = /^[a-z][a-z0-9-]{1,62}$/;
const IMAGE_NAME_REGEX = /^[a-z0-9][a-z0-9._/-]{0,126}[a-z0-9]$/;
const SEMVER_REGEX = /^\d+\.\d+\.\d+$/;

export { blocksReInstall } from '../../services/installation-record.service.js';

export async function installRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    '/api/v1/plugins/:slug/install',
    { preHandler: [requireAbac('plugin:manage')] },
    async (request) => {
      const { slug } = z.object({ slug: z.string().regex(SLUG_REGEX) }).parse(request.params);
      const ctx = request.tenantContext;
      const userId = request.user?.keycloakUserId;
      if (!userId) throw new ValidationError('User identity required');

      const plugin = (await withCoreDb(async (prisma: PrismaClient) =>
        prisma.plugin.findUnique({ where: { slug } })
      )) as Record<string, unknown> | null;

      if (!plugin) throw new PluginNotFoundError(slug);
      if (plugin.status !== 'published')
        throw new PluginValidationError(`Plugin "${slug}" is not published`);

      const registryUrl = z.string().url().parse(plugin.registryUrl);
      const imageName = z.string().regex(IMAGE_NAME_REGEX).parse(plugin.imageName);
      const imageTag = z.string().regex(SEMVER_REGEX).parse(plugin.imageTag);
      const manifest = manifestSchema.parse(plugin.manifest);

      // Strip URL scheme from registry host to build the image ref.
      const registryHost = (() => {
        try {
          return new URL(registryUrl).host;
        } catch {
          return registryUrl.replace(/^https?:\/\//, '');
        }
      })();
      const imagePath = imageName.startsWith(`${registryHost}/`)
        ? imageName
        : `${registryHost}/${imageName}`;
      const imageRef = `${imagePath}:${imageTag}`;
      const hostingType = manifest.hosting.type;

      const install = await createInstallationRecord({
        context: ctx,
        pluginId: plugin.id as string,
        pluginSlug: slug,
        pluginVersion: plugin.version as string,
        hostingType,
        userId,
      });

      // CRITICAL #1 — provision a restricted DB role for the plugin container.
      const role = await createPluginRole(install.id, ctx.slug, manifest.declaredTables);
      // Persist the encrypted connection string at rest in plugin_container_config
      // (a TENANT-schema table — must use withTenantDb, not the core prisma client).
      await withTenantDb(async (tx: TenantPrismaClient) => {
        await tx.pluginContainerConfig.upsert({
          where: { installId: install.id },
          create: {
            installId: install.id,
            image: imageRef,
            port: 0,
            envOverrides: role.encryptedEnvOverrides,
          },
          update: { envOverrides: role.encryptedEnvOverrides },
        });
      }, ctx).catch((err: unknown) => {
        logger.warn(
          { err: (err as Error)?.message, installId: install.id },
          'Failed to persist encrypted plugin env overrides'
        );
      });

      // CRITICAL #2 — run declared migrations under SET ROLE plugin_{installId}
      // so PostgreSQL enforces schema/table scope. The role gets CREATE on the
      // tenant schema only for the duration of the migration loop.
      await runMigrationSecurityPhase(install.id, ctx, async () => {
        await withTenantDb(async (tenantDb) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return (tenantDb as any).$transaction(async (tx: any) => {
            await runPluginMigrations({
              tx,
              manifest,
              role,
              installId: install.id,
              pluginId: plugin.id as string,
            });
          });
        }, ctx);
      });

      // Grant DML on the now-created plugin tables to the restricted role. This
      // MUST run after runPluginMigrations — granting before table creation throws.
      try {
        await grantTablePrivileges(install.id, ctx.slug, manifest.declaredTables);
      } catch (err: unknown) {
        await cleanupFailedInstallation(install.id, ctx, err);
        throw err;
      }

      const degraded = await installPluginRuntime({
        context: ctx,
        installId: install.id,
        pluginId: plugin.id as string,
        pluginSlug: slug,
        pluginVersion: plugin.version as string,
        hostingType,
        imageRef,
        manifest,
        role,
      });

      const finalStatus = degraded ? 'degraded' : 'active';
      await withTenantDb(
        (db: TenantPrismaClient) =>
          db.$transaction(async (tx) => {
            await tx.pluginInstallation.update({
              where: { id: install.id },
              data: { status: finalStatus },
            });
            await enqueueEvent(
              tx,
              'plexica.plugin.installed',
              buildDomainEvent({
                type: 'plexica.plugin.installed',
                tenantId: ctx.tenantId,
                producer: { kind: 'core', id: 'core' },
                payload: { installId: install.id, pluginId: plugin.id as string, slug },
              })
            );
          }),
        ctx
      );
      return { status: finalStatus, installId: install.id, slug };
    }
  );
}
