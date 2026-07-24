import { randomUUID } from 'node:crypto';

import { ensureTenantEventKey } from '../../events/event-key-service.js';

import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';

export async function poll<T>(
  fn: () => Promise<T>,
  done: (value: T) => boolean,
  timeoutMs = 30_000,
  intervalMs = 300
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await fn();
    if (done(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error('poll timeout');
}

export async function seedDeletionResidue(
  prisma: PrismaClient,
  redis: Redis,
  tenantId: string,
  tenantSlug: string,
  schemaName: string
): Promise<string[]> {
  const installId = randomUUID();
  const plugin = await prisma.plugin.upsert({
    where: { slug: 'deletion-residue-fixture' },
    create: {
      slug: 'deletion-residue-fixture', name: 'Deletion residue fixture', version: '1.0.0',
      author: 'Plexica', registryUrl: 'local', imageName: 'fixture', imageTag: 'latest',
      createdByKeycloakId: 'system',
    },
    update: {},
  });
  await prisma.$executeRawUnsafe(
    `INSERT INTO "${schemaName}".plugin_installations
      (id, plugin_id, tenant_slug, status, installed_by)
      VALUES ($1::uuid, $2::uuid, $3, 'active', $4::uuid)`,
    installId,
    plugin.id,
    tenantSlug,
    randomUUID()
  );
  const eventId = randomUUID();
  await ensureTenantEventKey(prisma, tenantId);
  await prisma.eventOutbox.create({
    data: {
      eventId, tenantId, topic: 'plexica.workspace.created',
      eventType: 'plexica.workspace.created', schemaVersion: 1,
      payload: { marker: 'deletion-fixture' }, producerKind: 'core', producerId: 'core',
      correlationId: randomUUID(), occurredAt: new Date(),
    },
  });
  await prisma.deadLetterQueue.create({
    data: {
      tenantId, installId, eventId, eventType: 'plexica.workspace.created', schemaVersion: 1,
      payload: { marker: 'deletion-fixture' }, pluginId: plugin.id,
      originalTopic: 'plexica.workspace.created', originalPartition: 0, originalOffset: 1n,
      dedupeKey: randomUUID().replaceAll('-', '').repeat(2),
    },
  });
  await prisma.pluginServiceCredential.create({
    data: {
      id: randomUUID(), tenantId, installId, pluginId: plugin.id,
      pluginSlug: plugin.slug, scope: 'events:emit', secretDigest: new Uint8Array(32),
      version: 1, status: 'active', expiresAt: new Date(Date.now() + 60_000),
    },
  });
  const keys = [
    `abac:${tenantSlug}:${randomUUID()}:${randomUUID()}`,
    `plugin:vis:${installId}:${randomUUID()}`,
    `plugin:cb:${installId}`,
    `tenant:${tenantId}:settings`,
    `metrics:${tenantSlug}:users`,
    `cache:${tenantSlug}:config`,
  ];
  await redis.mset(keys.flatMap((key) => [key, 'sensitive-test-value']));
  return keys;
}

export async function readDeletionResidue(
  prisma: PrismaClient,
  redis: Redis,
  tenantId: string,
  keys: string[]
): Promise<{
  tenant: Awaited<ReturnType<PrismaClient['tenant']['findUnique']>>;
  configCount: number;
  auditMetadata: string;
  redisValues: Array<string | null>;
  eventResidue: { credentials: number; outbox: number; deadLetters: number; readableKeys: number };
}> {
  const [tenant, configCount, audits, redisValues, credentials, outbox, deadLetters, readableKeys] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId } }),
    prisma.tenantConfig.count({ where: { tenantId } }),
    prisma.platformAuditLog.findMany({ where: { tenantId }, select: { metadata: true } }),
    redis.mget(keys),
    prisma.pluginServiceCredential.count({ where: { tenantId } }),
    prisma.eventOutbox.count({ where: { tenantId } }),
    prisma.deadLetterQueue.count({ where: { tenantId } }),
    prisma.tenantEventKey.count({
      where: { tenantId, OR: [
        { status: { not: 'destroyed' } }, { wrappedKey: { not: null } },
        { wrapIv: { not: null } }, { wrapTag: { not: null } },
      ] },
    }),
  ]);
  return {
    tenant,
    configCount,
    auditMetadata: JSON.stringify(audits.map((audit) => audit.metadata)),
    redisValues,
    eventResidue: { credentials, outbox, deadLetters, readableKeys },
  };
}

export async function deleteEventResidue(prisma: PrismaClient, tenantId: string): Promise<void> {
  await prisma.pluginServiceCredential.deleteMany({ where: { tenantId } });
  await prisma.eventOutbox.deleteMany({ where: { tenantId } });
  await prisma.deadLetterQueue.deleteMany({ where: { tenantId } });
  await prisma.tenantEventKey.deleteMany({ where: { tenantId } });
  await prisma.tenantLifecycleReconciliation.deleteMany({ where: { tenantId } });
}
