// outbox-publisher.int.test.ts
// Integration tests for publishOutboxBatch retry/deferral semantics.
// Real DB (claim/release/acknowledge), real event encryption, real tenant
// status checks — only the Kafka send is injected through the designed
// `send` parameter seam of publishOutboxBatch.
// Promoted from the former fully-mocked unit test (unit/outbox-publisher.test.ts).

import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildDomainEvent } from '../events/event-envelope.js';
import { enqueueEvent } from '../events/outbox-repository.js';
import { publishOutboxBatch } from '../events/outbox-publisher.js';
import { prisma } from '../lib/database.js';

import type { WireEventEnvelope } from '../events/event-envelope.js';

const TOPIC = 'plexica.workspace.created';
const tenantIds: string[] = [];

afterEach(async () => {
  await prisma.eventOutbox.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.tenantEventKey.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  tenantIds.length = 0;
});

async function seedTenantWithEvent(): Promise<{ tenantId: string; eventId: string }> {
  const tenantId = crypto.randomUUID();
  const eventId = crypto.randomUUID();
  tenantIds.push(tenantId);
  await prisma.$transaction(async (tx) => {
    await tx.tenant.create({
      data: { id: tenantId, slug: `pub-${tenantId.slice(0, 8)}`, name: 'Publisher Test' },
    });
    await enqueueEvent(
      tx,
      TOPIC,
      buildDomainEvent({
        eventId,
        type: TOPIC,
        tenantId,
        producer: { kind: 'core', id: 'core' },
        correlationId: eventId,
        payload: { marker: 'must-be-encrypted' },
      })
    );
  });
  return { tenantId, eventId };
}

describe('outbox publisher', () => {
  it('retains the event with a stable ID for retry when the Kafka send fails', async () => {
    const { eventId } = await seedTenantWithEvent();
    const sent: WireEventEnvelope[] = [];
    const send = async (_topic: string, event: WireEventEnvelope): Promise<void> => {
      sent.push(event);
      if (sent.length === 1) throw new Error('Kafka unavailable');
    };

    await expect(publishOutboxBatch(prisma, send)).resolves.toEqual({ published: 0, failed: 1 });

    // Released, not acknowledged: still claimable, attempts incremented.
    const released = await prisma.eventOutbox.findUnique({ where: { eventId } });
    expect(released?.attempts).toBe(1);
    expect(released?.lastErrorCode).toBe('EVENT_PUBLISH_FAILED');
    expect(released?.leaseToken).toBeNull();

    // Bypass the exponential backoff so the retry is claimed immediately.
    await prisma.eventOutbox.update({ where: { eventId }, data: { availableAt: new Date(0) } });

    await expect(publishOutboxBatch(prisma, send)).resolves.toEqual({ published: 1, failed: 0 });
    expect(sent).toHaveLength(2);
    expect(sent[0]?.eventId).toBe(eventId);
    expect(sent[1]?.eventId).toBe(eventId);
    expect(JSON.stringify(sent[1])).not.toContain('must-be-encrypted');
    await expect(prisma.eventOutbox.findUnique({ where: { eventId } })).resolves.toBeNull();
  });

  it('never claims or publishes events for tenants pending deletion', async () => {
    const { tenantId, eventId } = await seedTenantWithEvent();
    await prisma.tenant.update({ where: { id: tenantId }, data: { status: 'pending_deletion' } });

    const send = vi.fn();
    // claimOutboxEvents joins core.tenants on status = 'active', so the event
    // is never picked up: nothing to encrypt, publish, or release.
    await expect(publishOutboxBatch(prisma, send)).resolves.toEqual({ published: 0, failed: 0 });

    expect(send).not.toHaveBeenCalled();
    const row = await prisma.eventOutbox.findUnique({ where: { eventId } });
    expect(row?.attempts).toBe(0);
    expect(row?.leaseToken).toBeNull();
    expect(row?.lastErrorCode).toBeNull();
  });
});
