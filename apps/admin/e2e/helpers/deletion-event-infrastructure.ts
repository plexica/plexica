import { randomUUID } from 'node:crypto';

import { setCoreServiceDefaults } from './deletion-infrastructure.js';

import type { WireEventEnvelope } from '../../../../services/core-api/src/events/event-envelope.js';

export async function seedDeletionEventData(
  tenantId: string
): Promise<WireEventEnvelope> {
  setCoreServiceDefaults();
  const [database, envelopes, crypto, keys, kafka] = await Promise.all([
    import('../../../../services/core-api/src/lib/database.js'),
    import('../../../../services/core-api/src/events/event-envelope.js'),
    import('../../../../services/core-api/src/events/event-crypto.js'),
    import('../../../../services/core-api/src/events/event-key-service.js'),
    import('../../../../services/core-api/src/lib/kafka.js'),
  ]);
  const { prisma } = database;
  const plugin = await prisma.plugin.upsert({
    where: { slug: 'e2e-deletion-event-fixture' },
    create: {
      slug: 'e2e-deletion-event-fixture', name: 'E2E deletion event fixture',
      version: '1.0.0', author: 'Plexica', registryUrl: 'local', imageName: 'fixture',
      imageTag: 'latest', createdByKeycloakId: 'system',
    },
    update: {},
  });
  const installId = randomUUID();
  const event = envelopes.buildDomainEvent({
    eventId: randomUUID(), type: 'plexica.workspace.created', tenantId,
    producer: { kind: 'core', id: 'core' }, correlationId: randomUUID(),
    payload: { marker: 'must-be-cryptographically-erased' },
  });
  const key = await keys.ensureTenantEventKey(prisma, tenantId);
  const wire = crypto.encryptDomainEvent(event, key.keyVersion, key.key);
  await kafka.sendKafkaEnvelope('plexica.workspace.created', wire);
  await prisma.eventOutbox.create({
    data: {
      eventId: randomUUID(), tenantId, topic: 'plexica.workspace.created',
      eventType: 'plexica.workspace.created', schemaVersion: 1,
      payload: { marker: 'pending-outbox' }, producerKind: 'core', producerId: 'core',
      correlationId: randomUUID(), occurredAt: new Date(),
      availableAt: new Date(Date.now() + 60 * 60 * 1_000),
    },
  });
  await prisma.deadLetterQueue.create({
    data: {
      tenantId, installId, eventId: event.eventId, eventType: event.type, schemaVersion: 1,
      payload: event, pluginId: plugin.id, originalTopic: 'plexica.workspace.created',
      originalPartition: 0, originalOffset: 1n,
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
  return wire;
}

export async function readDeletionEventProof(
  tenantId: string,
  wire: WireEventEnvelope
): Promise<{ credentials: number; outbox: number; deadLetters: number; destroyed: boolean }> {
  setCoreServiceDefaults();
  const [{ prisma }, keys] = await Promise.all([
    import('../../../../services/core-api/src/lib/database.js'),
    import('../../../../services/core-api/src/events/event-key-service.js'),
  ]);
  const [credentials, outbox, deadLetters] = await Promise.all([
    prisma.pluginServiceCredential.count({ where: { tenantId } }),
    prisma.eventOutbox.count({ where: { tenantId } }),
    prisma.deadLetterQueue.count({ where: { tenantId } }),
  ]);
  let destroyed = false;
  try {
    await keys.getTenantEventKey(prisma, tenantId, wire.encryption.keyVersion);
  } catch {
    destroyed = true;
  }
  return { credentials, outbox, deadLetters, destroyed };
}
