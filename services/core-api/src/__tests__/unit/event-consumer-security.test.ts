import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getKey: vi.fn(),
  moveToDlq: vi.fn(),
  tenantFind: vi.fn(),
}));

vi.mock('../../events/event-key-service.js', () => ({ getTenantEventKey: mocks.getKey }));
vi.mock('../../modules/plugin/events/dlq.service.js', () => ({ moveToDlq: mocks.moveToDlq }));
vi.mock('../../lib/database.js', () => ({
  prisma: { tenant: { findUnique: mocks.tenantFind } },
}));
vi.mock('../../lib/logger.js', () => ({ logger: { warn: vi.fn(), info: vi.fn() } }));

import { encryptDomainEvent } from '../../events/event-crypto.js';
import { buildDomainEvent, wireEventEnvelopeSchema } from '../../events/event-envelope.js';
import { processInstallationMessage } from '../../modules/plugin/events/consumer-manager.service.js';

const TENANT_A = '10000000-0000-4000-8000-000000000001';
const TENANT_B = '10000000-0000-4000-8000-000000000002';
const INSTALL_ID = '20000000-0000-4000-8000-000000000002';
const PLUGIN_ID = '30000000-0000-4000-8000-000000000003';
const EVENT_ID = '40000000-0000-4000-8000-000000000004';
const KEY = Buffer.alloc(32, 9);
const source = { topic: 'plexica.workspace.created', partition: 0, offset: '12' };

function wire(tenantId: string) {
  return encryptDomainEvent(buildDomainEvent({
    eventId: EVENT_ID,
    type: 'plexica.workspace.created',
    tenantId,
    producer: { kind: 'core', id: 'core' },
    correlationId: EVENT_ID,
    payload: { workspaceId: EVENT_ID },
  }), 1, KEY);
}

function process(value: string, handler = vi.fn()) {
  return processInstallationMessage({
    installId: INSTALL_ID,
    tenantId: TENANT_A,
    pluginId: PLUGIN_ID,
    source,
    value,
    handler,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getKey.mockResolvedValue(KEY);
  mocks.moveToDlq.mockResolvedValue(undefined);
  mocks.tenantFind.mockResolvedValue({ status: 'active' });
});

describe('installation consumer security', () => {
  it('commits an irrelevant tenant event without decrypting or dispatching it', async () => {
    const handler = vi.fn();
    await process(JSON.stringify(wire(TENANT_B)), handler);
    expect(mocks.getKey).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
    expect(mocks.moveToDlq).not.toHaveBeenCalled();
  });

  it('decrypts and dispatches only an exact tenant match', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    await process(JSON.stringify(wire(TENANT_A)), handler);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: EVENT_ID, tenantId: TENANT_A, schemaVersion: 1 }),
      source
    );
  });

  it('does not decrypt or dispatch events for an inactive tenant', async () => {
    mocks.tenantFind.mockResolvedValue({ status: 'suspended' });
    const handler = vi.fn();
    await process(JSON.stringify(wire(TENANT_A)), handler);
    expect(mocks.getKey).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it('quarantines malformed envelopes without retaining their raw value', async () => {
    await process('{"payload":"readable-domain-value"}');
    const quarantined = mocks.moveToDlq.mock.calls[0]![0];
    expect(quarantined).toMatchObject({
      tenantId: TENANT_A,
      installId: INSTALL_ID,
      errorCode: 'MALFORMED_ENVELOPE',
    });
    expect(JSON.stringify(quarantined)).not.toContain('readable-domain-value');
  });

  it('rejects unversioned and plaintext wire envelopes', () => {
    expect(wireEventEnvelopeSchema.safeParse({
      eventId: EVENT_ID,
      tenantId: TENANT_A,
      type: 'plexica.workspace.created',
      payload: { readable: true },
    }).success).toBe(false);
  });
});
