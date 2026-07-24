import { describe, expect, it } from 'vitest';

import {
  compareServiceCredentialDigest,
  digestServiceCredential,
  generateServiceCredential,
  parseServiceCredential,
} from '../../modules/plugin/services/service-credential-token.js';

const PEPPER = 'unit-test-pepper-with-at-least-thirty-two-bytes';

describe('plugin service credential tokens', () => {
  it('generates the accepted opaque syntax without exposing digest material', () => {
    const issued = generateServiceCredential(PEPPER);
    const parsed = parseServiceCredential(issued.token);
    expect(issued.token).toMatch(/^plxsvc_[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/);
    expect(parsed?.credentialId).toBe(issued.credentialId);
    expect(issued.token).not.toContain(issued.digest.toString('hex'));
  });

  it.each([
    '',
    '11111111-2222-4333-8444-555555555555.acme.deadbeef',
    'plxsvc_not-a-uuid.secret',
    `plxsvc_11111111-2222-4333-8444-555555555555.${'a'.repeat(42)}`,
  ])('rejects malformed legacy or opaque token %s', (token) => {
    expect(parseServiceCredential(token)).toBeNull();
  });

  it('binds the digest to id, secret, and pepper', () => {
    const issued = generateServiceCredential(PEPPER);
    const parsed = parseServiceCredential(issued.token)!;
    const correct = digestServiceCredential(parsed.credentialId, parsed.secret, PEPPER);
    const wrongId = digestServiceCredential(crypto.randomUUID(), parsed.secret, PEPPER);
    const wrongPepper = digestServiceCredential(parsed.credentialId, parsed.secret, `${PEPPER}!`);
    expect(compareServiceCredentialDigest(issued.digest, correct)).toBe(true);
    expect(compareServiceCredentialDigest(issued.digest, wrongId)).toBe(false);
    expect(compareServiceCredentialDigest(issued.digest, wrongPepper)).toBe(false);
    expect(compareServiceCredentialDigest(issued.digest, Buffer.alloc(1))).toBe(false);
  });
});
