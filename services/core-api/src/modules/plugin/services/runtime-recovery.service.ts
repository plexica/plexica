import { prisma } from '../../../lib/database.js';
import { logger } from '../../../lib/logger.js';
import { withTenantDb } from '../../../lib/tenant-database.js';
import { toRealmName, toSchemaName } from '../../../lib/tenant-schema-helpers.js';
import { createConsumerGroup } from '../events/consumer-manager.service.js';
import { dispatchEvent } from '../events/event-dispatcher.service.js';
import { manifestSchema } from '../schema/manifest.js';

import { createContainerManager } from './container-manager.service.js';
import { getDevBackendForInstallation } from './dev-backends.js';
import {
  completeCredentialRotation,
  hasUsableInstallationCredential,
  issueServiceCredential,
} from './service-credential.service.js';

interface RuntimeInstallation {
  id: string;
  pluginId: string;
  tenantId?: string;
  tenantSlug: string;
  hostingType: string;
}

interface RuntimePlugin {
  id: string;
  slug: string;
  manifest: unknown;
}

export async function startInstallationConsumer(
  installation: RuntimeInstallation,
  plugin: RuntimePlugin
): Promise<boolean> {
  const manifest = manifestSchema.safeParse(plugin.manifest);
  if (!manifest.success) throw new Error(`Invalid manifest for plugin ${plugin.slug}`);
  const subscriptions = manifest.data.events?.subscribes ?? [];
  if (subscriptions.length === 0) return false;
  const tenantId =
    installation.tenantId ??
    (
      await prisma.tenant.findUnique({
        where: { slug: installation.tenantSlug },
        select: { id: true },
      })
    )?.id;
  if (!tenantId) throw new Error(`Tenant ${installation.tenantSlug} not found during recovery`);

  await createConsumerGroup(
    installation.id,
    tenantId,
    installation.tenantSlug,
    subscriptions,
    async (event) => {
      const devBackend = getDevBackendForInstallation(plugin.slug, installation.id);
      const backendUrl =
        devBackend?.baseUrl ??
        (await createContainerManager(installation.hostingType).getContainerUrl(installation.id));
      await dispatchEvent(backendUrl, event);
    },
    plugin.id
  );
  return true;
}

export async function recoverInstallationConsumer(
  installation: RuntimeInstallation
): Promise<boolean> {
  const plugin = await prisma.plugin.findUnique({
    where: { id: installation.pluginId },
    select: { id: true, slug: true, manifest: true },
  });
  if (!plugin) throw new Error(`Plugin ${installation.pluginId} not found during runtime recovery`);
  return startInstallationConsumer(installation, plugin);
}

async function reconcileRuntimeCredential(
  installation: RuntimeInstallation,
  tenantId: string
): Promise<void> {
  if (await hasUsableInstallationCredential(installation.id)) return;
  const plugin = await prisma.plugin.findUnique({
    where: { id: installation.pluginId },
    select: { slug: true },
  });
  if (!plugin)
    throw new Error(`Plugin ${installation.pluginId} not found during credential rotation`);
  const credential = await issueServiceCredential({
    tenantId,
    tenantSlug: installation.tenantSlug,
    installId: installation.id,
    pluginId: installation.pluginId,
    pluginSlug: plugin.slug,
  });
  try {
    await createContainerManager(installation.hostingType).restartContainer(installation.id, {
      PLEXICA_SERVICE_TOKEN: credential.token,
    });
    await completeCredentialRotation(installation.id, credential.credentialId, true);
  } catch (error) {
    await completeCredentialRotation(installation.id, credential.credentialId, false);
    throw error;
  }
}

export async function reconcilePluginRuntimes(): Promise<{ restored: number; failed: number }> {
  const tenants = await prisma.tenant.findMany({
    where: { status: 'active' },
    select: { id: true, slug: true },
  });
  let restored = 0;
  let failed = 0;

  for (const tenant of tenants) {
    const context = {
      tenantId: tenant.id,
      slug: tenant.slug,
      schemaName: toSchemaName(tenant.slug),
      realmName: toRealmName(tenant.slug),
    };
    try {
      const installations = await withTenantDb(
        (db) =>
          db.pluginInstallation.findMany({
            where: { tenantSlug: tenant.slug, status: { in: ['active', 'degraded'] } },
            select: { id: true, pluginId: true, tenantSlug: true, hostingType: true },
          }),
        context
      );
      for (const installation of installations) {
        try {
          await reconcileRuntimeCredential(installation, tenant.id);
          if (await recoverInstallationConsumer({ ...installation, tenantId: tenant.id }))
            restored++;
        } catch (error) {
          await withTenantDb(
            (db) =>
              db.pluginInstallation.update({
                where: { id: installation.id },
                data: { status: 'degraded' },
              }),
            context
          ).catch(() => undefined);
          failed++;
          logger.error(
            { err: error, installId: installation.id },
            'Failed to restore plugin consumer'
          );
        }
      }
    } catch (error) {
      failed++;
      logger.error(
        { err: error, tenantSlug: tenant.slug },
        'Failed to inspect tenant plugin runtimes'
      );
    }
  }
  logger.info({ restored, failed }, 'Plugin runtime reconciliation completed');
  return { restored, failed };
}
