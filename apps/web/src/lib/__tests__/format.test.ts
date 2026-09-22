// lib/__tests__/format.test.ts
// Locale/timezone-aware formatting helpers (006-08).

import { describe, expect, it } from 'vitest';

import { formatCurrency, formatDate, formatDateTime, formatNumber } from '../format.js';

const EN = { locale: 'en', timezone: 'UTC' };
const IT = { locale: 'it', timezone: 'Europe/Rome' };

describe('formatDateTime', () => {
  it('formats an ISO timestamp in the given locale and timezone', () => {
    const out = formatDateTime('2026-04-01T12:30:00.000Z', IT);
    // Europe/Rome is UTC+2 in April → 14:30 local.
    expect(out).toContain('14:30');
  });

  it('differs between timezones for the same instant', () => {
    const utc = formatDateTime('2026-04-01T12:30:00.000Z', EN);
    const rome = formatDateTime('2026-04-01T12:30:00.000Z', { locale: 'en', timezone: 'Europe/Rome' });
    expect(utc).toContain('12:30');
    expect(rome).toContain('14:30');
  });

  it('falls back to the raw string for unparseable dates (no crash)', () => {
    expect(formatDateTime('not-a-date', EN)).toBe('not-a-date');
  });

  it('falls back to UTC for invalid timezone values', () => {
    const out = formatDateTime('2026-04-01T12:30:00.000Z', {
      locale: 'en',
      timezone: 'Mars/Olympus',
    });
    expect(out).toContain('12:30');
  });
});

describe('formatDate', () => {
  it('drops the time component', () => {
    const out = formatDate('2026-04-01T12:30:00.000Z', EN);
    expect(out).not.toContain(':');
  });
});

describe('formatNumber / formatCurrency', () => {
  it('groups digits per locale', () => {
    expect(formatNumber(1234567, 'en')).toBe('1,234,567');
    expect(formatNumber(1234567, 'it')).toBe('1.234.567');
  });

  it('formats currency with locale symbol', () => {
    expect(formatCurrency(19.9, 'EUR', 'it')).toContain('19,90');
    expect(formatCurrency(19.9, 'USD', 'en')).toContain('19.90');
  });
});