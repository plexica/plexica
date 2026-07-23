import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  claim: vi.fn(),
  acknowledge: vi.fn(),
  release: vi.fn(),
  metrics: vi.fn(),
  ensureKey: vi.fn(),
}));

vi.mock('../../events/outbox-repository.js', () => ({
  claimOutboxEvents: mocks.claim,
  acknowledgeOutboxEvent: mocks.acknowledge,
  releaseOutboxEvent: mocks.release,
  getOutboxMetrics: mocks.metrics,
}));
vi.mock('../../events/event-key-service.js', () => ({ ensureTenantEventKey: mocks.ensureKey }));
vi.mock('../../lib/database.js', () => ({ prisma: {} }));
vi.mock('../../lib/kafka.js', () => ({ sendKafkaEnvelope: vi.fn() }));
vi.mock('../../lib/logger.js', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import { publishOutboxBatch } from '../../events/outbox-publisher.js';

const EVENT_ID = '40000000-0000-4000-8000-000000000004';
const TENANT_ID = '10000000-0000-4000-8000-000000000001';
const row = {
  eventId: EVENT_ID,
  type: 'plexica.workspace.created',
  schemaVersion: 1 as const,
  tenantId: TENANT_ID,
  occurredAt: '2026-07-23T12:00:00.000Z',
  producer: { kind: 'core' as const, id: 'core' as const },
  correlationId: EVENT_ID,
  causationId: null,
  payload: { name: 'must-be-encrypted' },
  topic: 'plexica.workspace.created',
  attempts: 0,
  leaseToken: '50000000-0000-4000-8000-000000000005',
};
const db = {
  tenant: { findUnique: vi.fn().mockResolvedValue({ status: 'active' }) },
};

beforeEach(() => {
  vi.clearAllMocks();
  db.tenant.findUnique.mockResolvedValue({ status: 'active' });
  mocks.claim.mockResolvedValue([row]);
  mocks.ensureKey.mockResolvedValue({ keyVersion: 1, key: Buffer.alloc(32, 3) });
  mocks.acknowledge.mockResolvedValue(true);
  mocks.release.mockResolvedValue(true);
  mocks.metrics.mockResolvedValue({ pending: 0, oldestAgeSeconds: 0, maxAttempts: 0 });
});

describe('outbox publisher', () => {
  it('retains the stable event ID and lease when Kafka fails, then retries ciphertext', async () => {
    const send = vi.fn()
      .mockRejectedValueOnce(new Error('Kafka unavailable'))
      .mockResolvedValueOnce(undefined);
    await expect(publishOutboxBatch(db as never, send)).resolves.toEqual({ published: 0, failed: 1 });
    await expect(publishOutboxBatch(db as never, send)).resolves.toEqual({ published: 1, failed: 0 });
    expect(mocks.release).toHaveBeenCalledWith(db, row, 'EVENT_PUBLISH_FAILED');
    expect(send.mock.calls[0]![1].eventId).toBe(EVENT_ID);
    expect(send.mock.calls[1]![1].eventId).toBe(EVENT_ID);
    expect(JSON.stringify(send.mock.calls[1]![1])).not.toContain('must-be-encrypted');
  });

  it('does not encrypt or publish a claimed event after pending deletion begins', async () => {
    db.tenant.findUnique.mockResolvedValue({ status: 'pending_deletion' });
    const send = vi.fn();
    await expect(publishOutboxBatch(db as never, send)).resolves.toEqual({
      published: 0,
      failed: 1,
    });
    expect(mocks.ensureKey).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(mocks.release).toHaveBeenCalledWith(db, row, 'EVENT_PUBLISH_FAILED');
  });
});
