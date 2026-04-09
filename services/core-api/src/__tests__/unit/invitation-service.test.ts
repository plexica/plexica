// invitation-service.test.ts
// Pure unit tests for invitation token generation and expiry logic.
// Tests the crypto utility directly and mirrors the service expiry logic
// without any network or DB calls.

import { describe, expect, it } from 'vitest';

import { generateInviteToken } from '../../lib/crypto.js';

// ---------------------------------------------------------------------------
// Mirror of the private expiryDate() logic in invitation/service.ts.
// We test the math here in isolation with a fixed INVITATION_EXPIRY_DAYS=7.
// ---------------------------------------------------------------------------

const INVITATION_EXPIRY_DAYS = 7;

function calculateExpiryDate(createdAt: Date): Date {
  const d = new Date(createdAt);
  d.setDate(d.getDate() + INVITATION_EXPIRY_DAYS);
  return d;
}

function isExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return now > expiresAt;
}

// ===========================================================================
// Tests
// ===========================================================================

describe('generateInviteToken()', () => {
  it('returns a string of length >= 43 characters (32 bytes base64url)', () => {
    // 32 bytes → ceil(32 * 4/3) = 43 chars in base64url (no padding)
    const token = generateInviteToken();
    expect(token.length).toBeGreaterThanOrEqual(43);
  });

  it('two consecutive calls return different tokens', () => {
    const t1 = generateInviteToken();
    const t2 = generateInviteToken();
    expect(t1).not.toBe(t2);
  });

  it('token is URL-safe: no +, /, or = characters', () => {
    for (let i = 0; i < 20; i++) {
      const token = generateInviteToken();
      expect(token).not.toContain('+');
      expect(token).not.toContain('/');
      expect(token).not.toContain('=');
    }
  });

  it('token contains only base64url-safe characters', () => {
    const safePattern = /^[A-Za-z0-9_-]+$/;
    for (let i = 0; i < 20; i++) {
      expect(generateInviteToken()).toMatch(safePattern);
    }
  });
});

describe('calculateExpiryDate()', () => {
  it('returns createdAt + 7 days', () => {
    const created = new Date('2026-01-01T00:00:00.000Z');
    const expiry = calculateExpiryDate(created);
    const expected = new Date('2026-01-08T00:00:00.000Z');
    expect(expiry.toISOString()).toBe(expected.toISOString());
  });

  it('does not mutate the input date', () => {
    const created = new Date('2026-01-01T00:00:00.000Z');
    const originalIso = created.toISOString();
    calculateExpiryDate(created);
    expect(created.toISOString()).toBe(originalIso);
  });

  it('handles month-boundary rollover correctly', () => {
    // Jan 28 + 7 days = Feb 4
    const created = new Date('2026-01-28T12:00:00.000Z');
    const expiry = calculateExpiryDate(created);
    expect(expiry.getUTCMonth()).toBe(1); // February (0-indexed)
    expect(expiry.getUTCDate()).toBe(4);
  });
});

describe('isExpired()', () => {
  it('returns true when expiresAt is 1 second in the past', () => {
    const now = new Date('2026-01-10T12:00:00.000Z');
    const expiresAt = new Date('2026-01-10T11:59:59.000Z'); // 1 second ago
    expect(isExpired(expiresAt, now)).toBe(true);
  });

  it('returns false when expiresAt is 1 day in the future', () => {
    const now = new Date('2026-01-10T12:00:00.000Z');
    const expiresAt = new Date('2026-01-11T12:00:00.000Z'); // tomorrow
    expect(isExpired(expiresAt, now)).toBe(false);
  });

  it('returns false when expiresAt equals now (not yet expired)', () => {
    const now = new Date('2026-01-10T12:00:00.000Z');
    // now > expiresAt is false when they are equal
    expect(isExpired(now, now)).toBe(false);
  });

  it('returns true for a token that expired 7 days ago', () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const expiresAt = calculateExpiryDate(createdAt); // Jan 8
    const now = new Date('2026-01-15T00:00:00.000Z'); // well past
    expect(isExpired(expiresAt, now)).toBe(true);
  });
});
