import { Prisma } from '@prisma/client';

import { pauseConsumerGroup } from '../../plugin/events/consumer-manager.service.js';
import { createContainerManager } from '../../plugin/services/container-manager.service.js';
import { pauseTenantPluginRuntime } from '../../plugin/services/tenant-runtime-lifecycle.service.js';

import type { PrismaClient } from '@prisma/client';
import type { DeletionContext } from './deletion-context.service.js';

async function stopTenantEventPaths(
  prisma: PrismaClient,
  tenantId: string,
  context: DeletionContext
): Promise<void> {
  const relation = `${context.schemaName}.plugin_installations`;
  const existing = await prisma.$queryRaw<Array<{ name: string | null }>>(Prisma.sql`
    SELECT to_regclass(${relation})::text AS name
  `);
  if (existing[0]?.name) {
    await pauseTenantPluginRuntime(tenantId, context.tenantSlug);
    return;
  }
  const manager = createContainerManager('sidecar');
  for (const installId of context.pluginInstallIds) {
    await pauseConsumerGroup(installId, context.tenantSlug);
    await manager.stopContainer(installId);
  }
}

export async function executeEventDataPurge(
  prisma: PrismaClient,
  tenantId: string,
  context: DeletionContext
): Promise<void> {
  await stopTenantEventPaths(prisma, tenantId, context);
  await prisma.$transaction(async (tx) => {
    await tx.pluginServiceCredential.updateMany({
      where: { tenantId, status: { in: ['pending', 'active'] } },
      data: { status: 'revoked', revokedAt: new Date() },
    });
    await tx.pluginServiceCredential.deleteMany({ where: { tenantId } });
    await tx.eventOutbox.deleteMany({ where: { tenantId } });
    await tx.deadLetterQueue.deleteMany({ where: { tenantId } });
    await tx.tenantEventKey.updateMany({
      where: { tenantId },
      data: {
        status: 'destroyed',
        wrappedKey: null,
        wrapIv: null,
        wrapTag: null,
        destroyedAt: new Date(),
      },
    });

    const [credentials, outbox, deadLetters, readableKeys] = await Promise.all([
      tx.pluginServiceCredential.count({ where: { tenantId } }),
      tx.eventOutbox.count({ where: { tenantId } }),
      tx.deadLetterQueue.count({ where: { tenantId } }),
      tx.tenantEventKey.count({
        where: {
          tenantId,
          OR: [
            { status: { not: 'destroyed' } },
            { wrappedKey: { not: null } },
            { wrapIv: { not: null } },
            { wrapTag: { not: null } },
          ],
        },
      }),
    ]);
    if (credentials + outbox + deadLetters + readableKeys !== 0) {
      throw new Error('EVENT_DATA_PURGE_INCOMPLETE');
    }
  });
}
