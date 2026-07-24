import { withTenantDb } from '../../../lib/tenant-database.js';
import { toRealmName, toSchemaName } from '../../../lib/tenant-schema-helpers.js';
import {
  pauseConsumerGroup,
  resumeConsumerGroup,
} from '../events/consumer-manager.service.js';

import { createContainerManager } from './container-manager.service.js';
import { disableDevBackend, enableDevBackend } from './dev-backends.js';
import { resetBreaker } from './health-check.service.js';
import { recoverInstallationConsumer } from './runtime-recovery.service.js';

interface TenantRuntime {
  id: string;
  pluginId: string;
  tenantSlug: string;
  hostingType: string;
}

async function tenantRuntimes(tenantId: string, tenantSlug: string): Promise<TenantRuntime[]> {
  const context = {
    tenantId,
    slug: tenantSlug,
    schemaName: toSchemaName(tenantSlug),
    realmName: toRealmName(tenantSlug),
  };
  return withTenantDb(
    (db) =>
      db.pluginInstallation.findMany({
        where: { tenantSlug, status: { in: ['active', 'degraded'] } },
        select: { id: true, pluginId: true, tenantSlug: true, hostingType: true },
      }),
    context
  );
}

export async function pauseTenantPluginRuntime(
  tenantId: string,
  tenantSlug: string
): Promise<void> {
  const failures: unknown[] = [];
  for (const runtime of await tenantRuntimes(tenantId, tenantSlug)) {
    disableDevBackend(runtime.id);
    const shutdown = await Promise.allSettled([
      pauseConsumerGroup(runtime.id, tenantSlug),
      createContainerManager(runtime.hostingType).stopContainer(runtime.id),
    ]);
    failures.push(...shutdown.flatMap((result) =>
      result.status === 'rejected' ? [result.reason] : []
    ));
  }
  if (failures.length > 0) throw failures[0];
}

export async function resumeTenantPluginRuntime(
  tenantId: string,
  tenantSlug: string
): Promise<void> {
  for (const runtime of await tenantRuntimes(tenantId, tenantSlug)) {
    await createContainerManager(runtime.hostingType).restartContainer(runtime.id);
    await resetBreaker(runtime.id);
    await recoverInstallationConsumer({ ...runtime, tenantId });
    await resumeConsumerGroup(runtime.id, tenantSlug);
    enableDevBackend(runtime.id);
  }
}
