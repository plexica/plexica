// Final GDPR purge and retained tombstone policy.

import { Prisma } from '@prisma/client';

import { logger } from '../../../lib/logger.js';
import { deleteRedisKeysByPatterns, redis } from '../../../lib/redis.js';

import { writeAuditEntry } from './audit-log.service.js';

import type { PrismaClient } from '@prisma/client';
import type { DeletionContext } from './deletion-context.service.js';

export const GDPR_TOMBSTONE_POLICY = 'gdpr-erasure-v1';

function redisPatterns(tenantId: string, context: DeletionContext): string[] {
  const patterns = [
    `abac:${context.tenantSlug}:*`,
    `tenant:context:${context.tenantSlug}`,
    `tenant:${context.tenantSlug}:*`,
    `tenant:${tenantId}:*`,
    `metrics:${context.tenantSlug}:*`,
    `metrics:${tenantId}:*`,
    `cache:${context.tenantSlug}:*`,
    `cache:${tenantId}:*`,
    'metrics:user_count:total',
    'metrics:workspace_count:total',
  ];
  for (const installId of context.pluginInstallIds) {
    patterns.push(`plugin:vis:${installId}:*`, `plugin:cb:${installId}`);
  }
  return patterns;
}

function retainedMetadata(action: string, value: Prisma.JsonValue): Prisma.InputJsonValue {
  if (action !== 'tenant.delete' || value === null || Array.isArray(value)) {
    return { policy: GDPR_TOMBSTONE_POLICY, redacted: true };
  }
  const source = value as Record<string, Prisma.JsonValue>;
  const retained: Record<string, Prisma.InputJsonValue> = { policy: GDPR_TOMBSTONE_POLICY };
  for (const key of ['phase', 'step', 'steps', 'missingStep']) {
    const candidate = source[key];
    if (candidate !== undefined && candidate !== null) {
      retained[key] = candidate as Prisma.InputJsonValue;
    }
  }
  return retained;
}

export async function completeGdprDeletion(
  prisma: PrismaClient,
  tenantId: string,
  stepId: string,
  leaseToken: string,
  context: DeletionContext
): Promise<void> {
  const deletedKeys = await deleteRedisKeysByPatterns(redis, redisPatterns(tenantId, context));

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.tenantDeletionStep.updateMany({
      where: { id: stepId, status: 'in_progress', leaseToken },
      data: { status: 'done', lastError: null, leaseToken: null, leaseExpiresAt: null },
    });
    if (claimed.count === 0) throw new Error('Deletion step lease lost');
    const incompleteSteps = await tx.tenantDeletionStep.count({
      where: { tenantId, status: { not: 'done' } },
    });
    if (incompleteSteps !== 0) throw new Error('Deletion completion gate is incomplete');

    await tx.tenantConfig.deleteMany({ where: { tenantId } });
    const audits = await tx.platformAuditLog.findMany({
      where: { tenantId },
      select: { id: true, action: true, metadata: true },
    });
    for (const audit of audits) {
      await tx.platformAuditLog.update({
        where: { id: audit.id },
        data: { metadata: retainedMetadata(audit.action, audit.metadata) },
      });
    }

    await tx.tenant.update({
      where: { id: tenantId },
      data: {
        slug: `deleted-${tenantId}`,
        name: 'Deleted tenant',
        status: 'deleted',
        minioBucket: null,
        deletionContext: Prisma.DbNull,
        version: { increment: 1 },
      },
    });
    await writeAuditEntry(tx, {
      actorId: 'system',
      action: 'tenant.delete',
      resourceType: 'tenant',
      resourceId: tenantId,
      tenantId,
      metadata: { phase: 'completed', policy: GDPR_TOMBSTONE_POLICY },
    });
  });

  logger.info({ tenantId, deletedKeys, policy: GDPR_TOMBSTONE_POLICY }, 'GDPR deletion completed');
}
