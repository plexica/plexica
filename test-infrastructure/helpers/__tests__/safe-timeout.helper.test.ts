import { describe, it, expect } from 'vitest';
import { sanitizeTimeoutMs, MAX_NODE_TIMEOUT_MS } from '../../../packages/lib/safe-timeout.helper';

describe('sanitizeTimeoutMs', () => {
  it('returns 0 for undefined or null', () => {
    expect(sanitizeTimeoutMs(undefined)).toBe(0);
    expect(sanitizeTimeoutMs(null)).toBe(0);
  });

  it('returns 0 for NaN or Infinity', () => {
    expect(sanitizeTimeoutMs(Number.NaN)).toBe(0);
    expect(sanitizeTimeoutMs(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('floors fractional inputs and clamps negatives to 0', () => {
    expect(sanitizeTimeoutMs(1234.9)).toBe(1234);
    expect(sanitizeTimeoutMs(-500)).toBe(0);
  });

  it('caps values at MAX_NODE_TIMEOUT_MS', () => {
    expect(sanitizeTimeoutMs(MAX_NODE_TIMEOUT_MS + 1000)).toBe(MAX_NODE_TIMEOUT_MS);
  });

  it('accepts numeric strings and coerces correctly', () => {
    // numeric string becomes number; use explicit coercion to avoid TS complaints
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore allow passing string for test
    expect(sanitizeTimeoutMs('2000')).toBe(2000);
  });
});
