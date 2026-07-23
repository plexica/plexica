import { describe, expect, it, vi } from 'vitest';

import { decryptWireEvent, encryptDomainEvent, unwrapEventKey, wrapEventKey } from '../../events/event-crypto.js';
import { buildDomainEvent } from '../../events/event-envelope.js';
import { destroyTenantEventKeys } from '../../events/event-key-service.js';

const TENANT_ID = '10000000-0000-4000-8000-000000000001';
const EVENT_ID = '40000000-0000-4000-8000-000000000004';

function event() {
  return buildDomainEvent({
    eventId: EVENT_ID,
    type: 'plexica.workspace.created',
    tenantId: TENANT_ID,
    producer: { kind: 'core', id: 'core' },
    correlationId: EVENT_ID,
    payload: { marker: 'domain-secret' },
  });
}

describe('event cryptography', () => {
  it('encrypts payload while authenticating all routing metadata', () => {
    const key = Buffer.alloc(32, 1);
    const original = event();
    const wire = encryptDomainEvent(original, 1, key);
    expect(JSON.stringify(wire)).not.toContain('domain-secret');
    expect(decryptWireEvent(wire, key)).toEqual(original);
    expect(() => decryptWireEvent({ ...wire, tenantId: crypto.randomUUID() }, key)).toThrow();
  });

  it('rejects tampered ciphertext', () => {
    const key = Buffer.alloc(32, 2);
    const wire = encryptDomainEvent(event(), 1, key);
    const first = wire.ciphertext[0] === 'A' ? 'B' : 'A';
    expect(() => decryptWireEvent({
      ...wire,
      ciphertext: `${first}${wire.ciphertext.slice(1)}`,
    }, key)).toThrow();
  });

  it('wraps tenant keys with tenant and version AAD', () => {
    const dataKey = Buffer.alloc(32, 3);
    const masterKey = Buffer.alloc(32, 4);
    const wrapped = wrapEventKey(dataKey, masterKey, TENANT_ID, 1);
    expect(unwrapEventKey(wrapped, masterKey, TENANT_ID, 1)).toEqual(dataKey);
    expect(() => unwrapEventKey(wrapped, masterKey, TENANT_ID, 2)).toThrow();
  });

  it('destroys all wrapped material in the status transition', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const destroyedAt = new Date('2026-07-23T12:00:00.000Z');
    await expect(destroyTenantEventKeys(
      { tenantEventKey: { updateMany } } as never,
      TENANT_ID,
      destroyedAt
    )).resolves.toBe(1);
    expect(updateMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, status: 'active' },
      data: {
        status: 'destroyed',
        wrappedKey: null,
        wrapIv: null,
        wrapTag: null,
        destroyedAt,
      },
    });
  });
});
