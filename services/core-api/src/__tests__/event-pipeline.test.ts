import { afterEach, describe, expect, it } from 'vitest';

import { decryptWireEvent } from '../events/event-crypto.js';
import { buildDomainEvent, wireEventEnvelopeSchema } from '../events/event-envelope.js';
import { getTenantEventKey } from '../events/event-key-service.js';
import { enqueueEvent } from '../events/outbox-repository.js';
import { publishOutboxBatch } from '../events/outbox-publisher.js';
import { prisma } from '../lib/database.js';
import { createConsumer } from '../lib/kafka.js';

const tenantIds: string[] = [];

afterEach(async () => {
  await prisma.eventOutbox.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.tenantEventKey.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  tenantIds.length = 0;
});

describe('event pipeline integration', () => {
  it('commits a mutation with outbox and publishes only tenant-keyed ciphertext', async () => {
    const tenantId = crypto.randomUUID();
    const eventId = crypto.randomUUID();
    const topic = 'plexica.workspace.created';
    tenantIds.push(tenantId);
    await prisma.$transaction(async (tx) => {
      await tx.tenant.create({
        data: { id: tenantId, slug: `event-${tenantId.slice(0, 8)}`, name: 'Event Test' },
      });
      await enqueueEvent(
        tx,
        topic,
        buildDomainEvent({
          eventId,
          type: topic,
          tenantId,
          producer: { kind: 'core', id: 'core' },
          correlationId: eventId,
          payload: { marker: 'readable-domain-marker' },
        })
      );
    });
    await expect(prisma.eventOutbox.findUnique({ where: { eventId } })).resolves.toBeDefined();

    const consumer = createConsumer(`event-pipeline-${crypto.randomUUID()}`, {
      fromBeginning: true,
    });
    await consumer.connect();
    await consumer.subscribe({ topics: [topic] });
    let resolveRecord!: (record: { key: string; value: string; tenantHeader: string }) => void;
    const received = new Promise<{ key: string; value: string; tenantHeader: string }>(
      (resolve) => {
        resolveRecord = resolve;
      }
    );
    await consumer.run({
      partitionsConsumedConcurrently: 1,
      eachMessage: async ({ message }) => {
        const value = message.value?.toString() ?? '';
        if (value.includes(eventId)) {
          resolveRecord({
            key: message.key?.toString() ?? '',
            value,
            tenantHeader: message.headers?.['tenant-id']?.toString() ?? '',
          });
        }
      },
    });
    // Assignment is readiness gate, not sleep
    {
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) {
        try {
          if (consumer.assignment().length > 0) break;
        } catch {
          // intentionally ignored — assignment not ready, will retry
        }
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    try {
      // Harden against the transient claim race and a concurrent background
      // publisher (core-api-e2e runs its own outbox publisher on the same DB).
      // If the row is already acked externally, the Kafka observation below is
      // the authoritative proof and the strict publish count is skipped.
      let publishResult: { published: number; failed: number } | undefined;
      let externallyPublished = false;
      for (let attempt = 0; attempt < 5; attempt++) {
        publishResult = await publishOutboxBatch();
        if (publishResult.published === 1 && publishResult.failed === 0) break;
        if (publishResult.published === 0 && publishResult.failed === 0) {
          const pending = await prisma.eventOutbox.findUnique({ where: { eventId } });
          if (!pending) {
            externallyPublished = true;
            break;
          }
          const leaseActive =
            pending.leaseToken !== null &&
            pending.leaseExpiresAt !== null &&
            new Date(pending.leaseExpiresAt).getTime() > Date.now();
          if (!leaseActive) {
            // Only reset claimability when no active lease is held.
            // If a lease is active we must wait for it to expire instead
            // of making the row appear claimable by touching only
            // availableAt, preserving the lease protection in
            // claimOutboxEvents().
            await prisma.eventOutbox.update({
              where: { eventId },
              data: {
                availableAt: new Date(Date.now() - 1_000),
                leaseToken: null,
                leaseExpiresAt: null,
              },
            });
          }
          await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
          continue;
        }
        break;
      }
      if (!externallyPublished) expect(publishResult).toEqual({ published: 1, failed: 0 });
      const record = await Promise.race([
        received,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Encrypted event was not observed')), 10_000)
        ),
      ]);
      expect(record.key).toBe(tenantId);
      expect(record.tenantHeader).toBe(tenantId);
      expect(record.value).not.toContain('readable-domain-marker');
      const wire = wireEventEnvelopeSchema.parse(JSON.parse(record.value));
      expect(wire).not.toHaveProperty('payload');
      const key = await getTenantEventKey(prisma, tenantId, wire.encryption.keyVersion);
      expect(decryptWireEvent(wire, key).payload).toEqual({ marker: 'readable-domain-marker' });
      await expect(prisma.eventOutbox.findUnique({ where: { eventId } })).resolves.toBeNull();
    } finally {
      await consumer.disconnect();
    }
  });

  it('rolls back both mutation and outbox when the transaction fails', async () => {
    const tenantId = crypto.randomUUID();
    const eventId = crypto.randomUUID();
    tenantIds.push(tenantId);
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.tenant.create({
          data: { id: tenantId, slug: `rollback-${tenantId.slice(0, 8)}`, name: 'Rollback Test' },
        });
        await enqueueEvent(
          tx,
          'plexica.workspace.created',
          buildDomainEvent({
            eventId,
            type: 'plexica.workspace.created',
            tenantId,
            producer: { kind: 'core', id: 'core' },
            payload: {},
          })
        );
        throw new Error('ROLLBACK_TEST');
      })
    ).rejects.toThrow('ROLLBACK_TEST');
    await expect(prisma.tenant.findUnique({ where: { id: tenantId } })).resolves.toBeNull();
    await expect(prisma.eventOutbox.findUnique({ where: { eventId } })).resolves.toBeNull();
  });

  it('rejects an outbox insert after pending deletion begins', async () => {
    const tenantId = crypto.randomUUID();
    const eventId = crypto.randomUUID();
    tenantIds.push(tenantId);
    await prisma.tenant.create({
      data: {
        id: tenantId,
        slug: `deleting-${tenantId.slice(0, 8)}`,
        name: 'Deleting tenant',
        status: 'pending_deletion',
      },
    });
    await expect(
      prisma.$transaction((tx) =>
        enqueueEvent(
          tx,
          'plexica.workspace.created',
          buildDomainEvent({
            eventId,
            type: 'plexica.workspace.created',
            tenantId,
            producer: { kind: 'core', id: 'core' },
            payload: { marker: 'must-not-persist' },
          })
        )
      )
    ).rejects.toThrow('TENANT_NOT_ACTIVE');
    await expect(prisma.eventOutbox.findUnique({ where: { eventId } })).resolves.toBeNull();
  });
});
