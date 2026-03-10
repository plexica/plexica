// File: packages/api-client/__tests__/retry-after.test.ts

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { parseRetryAfter } from '../src/retry-after.js';

describe('parseRetryAfter', () => {
  describe('integer seconds format', () => {
    it('should return the parsed integer for a valid seconds string', () => {
      expect(parseRetryAfter('42')).toBe(42);
    });

    it('should return 0 for "0"', () => {
      expect(parseRetryAfter('0')).toBe(0);
    });

    it('should return 60 (default) for a negative seconds string', () => {
      // A negative integer is not a valid Retry-After value; fall back to default
      expect(parseRetryAfter('-5')).toBe(60);
    });

    it('should return 1 for "1"', () => {
      expect(parseRetryAfter('1')).toBe(1);
    });

    it('should return 120 for "120"', () => {
      expect(parseRetryAfter('120')).toBe(120);
    });
  });

  describe('float seconds format (CDN extension)', () => {
    it('should round up a fractional value: "1.5" → 2', () => {
      // Some CDNs emit float Retry-After values (e.g. "1.5").
      // We accept these by matching /^-?\d+(\.\d+)?$/ and applying Math.ceil.
      expect(parseRetryAfter('1.5')).toBe(2);
    });

    it('should round up "0.1" → 1', () => {
      expect(parseRetryAfter('0.1')).toBe(1);
    });

    it('should return the integer unchanged for "2.0" → 2', () => {
      expect(parseRetryAfter('2.0')).toBe(2);
    });

    it('should return 60 for a negative float "-1.5"', () => {
      expect(parseRetryAfter('-1.5')).toBe(60);
    });
  });

  describe('HTTP-date format', () => {
    beforeEach(() => {
      // Fix "now" to a known point in time
      vi.setSystemTime(new Date('2026-03-09T12:00:00.000Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return correct seconds for a future HTTP-date', () => {
      // 30 seconds in the future
      const futureDate = new Date('2026-03-09T12:00:30.000Z').toUTCString();
      expect(parseRetryAfter(futureDate)).toBe(30);
    });

    it('should return at least 1 for a past HTTP-date', () => {
      const pastDate = new Date('2020-01-01T00:00:00.000Z').toUTCString();
      expect(parseRetryAfter(pastDate)).toBe(1);
    });

    it('should return at least 1 for a date exactly at "now"', () => {
      const nowDate = new Date('2026-03-09T12:00:00.000Z').toUTCString();
      // Math.ceil((0) / 1000) = 0, then Math.max(1, 0) = 1
      expect(parseRetryAfter(nowDate)).toBe(1);
    });
  });

  describe('missing or invalid values', () => {
    it('should return 60 for null', () => {
      expect(parseRetryAfter(null)).toBe(60);
    });

    it('should return 60 for undefined', () => {
      expect(parseRetryAfter(undefined)).toBe(60);
    });

    it('should return 60 for an empty string', () => {
      expect(parseRetryAfter('')).toBe(60);
    });

    it('should return 60 for a non-numeric, non-date string', () => {
      expect(parseRetryAfter('abc')).toBe(60);
    });

    it('should return 60 for a garbage string', () => {
      expect(parseRetryAfter('not-a-value!!')).toBe(60);
    });
  });
});
