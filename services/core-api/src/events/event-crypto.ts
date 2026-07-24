import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import {
  domainEventEnvelopeSchema,
  eventMetadata,
  wireEventEnvelopeSchema,
} from './event-envelope.js';

import type { DomainEventEnvelope, EventMetadata, WireEventEnvelope } from './event-envelope.js';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

function aad(metadata: EventMetadata): Buffer {
  return Buffer.from(JSON.stringify(metadata), 'utf8');
}

export function encryptDomainEvent(
  input: DomainEventEnvelope,
  keyVersion: number,
  key: Uint8Array
): WireEventEnvelope {
  const event = domainEventEnvelopeSchema.parse(input);
  if (key.byteLength !== 32) throw new Error('Event data key must be 32 bytes');
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(aad(eventMetadata(event)));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(event.payload), 'utf8'),
    cipher.final(),
  ]);
  return wireEventEnvelopeSchema.parse({
    ...eventMetadata(event),
    encryption: {
      algorithm: 'A256GCM',
      keyVersion,
      iv: iv.toString('base64url'),
      tag: cipher.getAuthTag().toString('base64url'),
    },
    ciphertext: ciphertext.toString('base64url'),
  });
}

export function decryptWireEvent(
  input: WireEventEnvelope,
  key: Uint8Array
): DomainEventEnvelope {
  const wire = wireEventEnvelopeSchema.parse(input);
  if (key.byteLength !== 32) throw new Error('Event data key must be 32 bytes');
  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(wire.encryption.iv, 'base64url')
  );
  decipher.setAAD(aad(eventMetadata(wire)));
  decipher.setAuthTag(Buffer.from(wire.encryption.tag, 'base64url'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(wire.ciphertext, 'base64url')),
    decipher.final(),
  ]);
  return domainEventEnvelopeSchema.parse({
    ...eventMetadata(wire),
    payload: JSON.parse(plaintext.toString('utf8')),
  });
}

export function wrapEventKey(
  dataKey: Uint8Array,
  masterKey: Uint8Array,
  tenantId: string,
  keyVersion: number
): { wrappedKey: Buffer; wrapIv: Buffer; wrapTag: Buffer } {
  if (masterKey.byteLength !== 32) throw new Error('Event master key must be 32 bytes');
  const wrapIv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, masterKey, wrapIv);
  cipher.setAAD(Buffer.from(`${tenantId}\n${keyVersion}`, 'utf8'));
  const wrappedKey = Buffer.concat([cipher.update(dataKey), cipher.final()]);
  return { wrappedKey, wrapIv, wrapTag: cipher.getAuthTag() };
}

export function unwrapEventKey(
  wrapped: { wrappedKey: Uint8Array; wrapIv: Uint8Array; wrapTag: Uint8Array },
  masterKey: Uint8Array,
  tenantId: string,
  keyVersion: number
): Buffer {
  const decipher = createDecipheriv(ALGORITHM, masterKey, wrapped.wrapIv);
  decipher.setAAD(Buffer.from(`${tenantId}\n${keyVersion}`, 'utf8'));
  decipher.setAuthTag(Buffer.from(wrapped.wrapTag));
  return Buffer.concat([decipher.update(wrapped.wrappedKey), decipher.final()]);
}
