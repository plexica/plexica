// File: apps/web/src/__tests__/theme/contrast-utils.test.ts
//
// T005-08: Unit tests for contrast-utils.ts (WCAG 2.1 contrast ratio utilities).
//
// Coverage targets:
//   1. hexToRgb parses valid hex colors
//   2. hexToRgb returns null for invalid input
//   3. contrastRatio computes the correct ratio for known pairs
//   4. wcagLevel returns correct conformance tier
//   5. meetsWcag correctly enforces normal vs large text thresholds

import { describe, it, expect } from 'vitest';
import {
  hexToRgb,
  relativeLuminance,
  contrastRatio,
  wcagLevel,
  meetsWcag,
} from '@/lib/contrast-utils';

// ---------------------------------------------------------------------------
// 1. hexToRgb
// ---------------------------------------------------------------------------

describe('hexToRgb', () => {
  it('parses a 6-digit hex color correctly', () => {
    expect(hexToRgb('#ffffff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 });
    expect(hexToRgb('#1976d2')).toEqual({ r: 25, g: 118, b: 210 });
  });

  it('parses a 3-digit shorthand hex color correctly', () => {
    expect(hexToRgb('#fff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(hexToRgb('#000')).toEqual({ r: 0, g: 0, b: 0 });
    expect(hexToRgb('#f80')).toEqual({ r: 255, g: 136, b: 0 });
  });

  it('accepts 8-digit hex (alpha ignored)', () => {
    // #rrggbbaa — alpha byte ignored for luminance
    expect(hexToRgb('#ffffff80')).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('accepts hex strings without leading #', () => {
    expect(hexToRgb('ffffff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(hexToRgb('000000')).toEqual({ r: 0, g: 0, b: 0 });
  });

  it('returns null for empty or invalid input', () => {
    expect(hexToRgb('')).toBeNull();
    expect(hexToRgb('#gg0000')).toBeNull();
    expect(hexToRgb('#12345')).toBeNull(); // 5 hex digits — unsupported
    expect(hexToRgb('not-a-color')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2. relativeLuminance
// ---------------------------------------------------------------------------

describe('relativeLuminance', () => {
  it('returns 1 for white', () => {
    expect(relativeLuminance(255, 255, 255)).toBeCloseTo(1.0, 4);
  });

  it('returns 0 for black', () => {
    expect(relativeLuminance(0, 0, 0)).toBeCloseTo(0.0, 4);
  });

  it('matches known midpoint grey (#808080)', () => {
    // #808080 ≈ 0.2158 relative luminance (W3C reference)
    const L = relativeLuminance(128, 128, 128);
    expect(L).toBeGreaterThan(0.2);
    expect(L).toBeLessThan(0.22);
  });
});

// ---------------------------------------------------------------------------
// 3. contrastRatio — known WCAG reference pairs
// ---------------------------------------------------------------------------

describe('contrastRatio', () => {
  it('returns 21 for black-on-white (maximum contrast)', () => {
    const ratio = contrastRatio('#000000', '#ffffff');
    expect(ratio).not.toBeNull();
    expect(ratio!).toBeCloseTo(21, 0);
  });

  it('returns 1 for identical colors (no contrast)', () => {
    const ratio = contrastRatio('#ffffff', '#ffffff');
    expect(ratio).not.toBeNull();
    expect(ratio!).toBeCloseTo(1, 4);
  });

  it('is symmetric (order of arguments does not matter)', () => {
    const r1 = contrastRatio('#1976d2', '#ffffff');
    const r2 = contrastRatio('#ffffff', '#1976d2');
    expect(r1).not.toBeNull();
    expect(r2).not.toBeNull();
    expect(r1!).toBeCloseTo(r2!, 4);
  });

  it('returns null if either color is invalid', () => {
    expect(contrastRatio('#invalid', '#ffffff')).toBeNull();
    expect(contrastRatio('#ffffff', '#invalid')).toBeNull();
    expect(contrastRatio('', '')).toBeNull();
  });

  it('returns a ratio ≥ 4.5 for Plexica brand blue (#1976d2) on white', () => {
    // Design token primary: #1976d2 — must meet AA on white per design spec
    const ratio = contrastRatio('#1976d2', '#ffffff');
    expect(ratio).not.toBeNull();
    // Known ratio is ~4.55 — AA compliant
    expect(ratio!).toBeGreaterThanOrEqual(4.5);
  });
});

// ---------------------------------------------------------------------------
// 4. wcagLevel
// ---------------------------------------------------------------------------

describe('wcagLevel', () => {
  it('returns "AAA" for ratio ≥ 7', () => {
    expect(wcagLevel(7)).toBe('AAA');
    expect(wcagLevel(21)).toBe('AAA');
    expect(wcagLevel(7.5)).toBe('AAA');
  });

  it('returns "AA" for ratio ≥ 4.5 and < 7', () => {
    expect(wcagLevel(4.5)).toBe('AA');
    expect(wcagLevel(5)).toBe('AA');
    expect(wcagLevel(6.99)).toBe('AA');
  });

  it('returns "AA Large" for ratio ≥ 3 and < 4.5', () => {
    expect(wcagLevel(3)).toBe('AA Large');
    expect(wcagLevel(4)).toBe('AA Large');
    expect(wcagLevel(4.49)).toBe('AA Large');
  });

  it('returns "Fail" for ratio < 3', () => {
    expect(wcagLevel(1)).toBe('Fail');
    expect(wcagLevel(2.99)).toBe('Fail');
    expect(wcagLevel(1.5)).toBe('Fail');
  });
});

// ---------------------------------------------------------------------------
// 5. meetsWcag
// ---------------------------------------------------------------------------

describe('meetsWcag', () => {
  it('passes AA for black text on white background (normal size)', () => {
    expect(meetsWcag('#000000', '#ffffff', 'normal')).toBe(true);
  });

  it('fails for low-contrast grey-on-white (normal size)', () => {
    // #aaaaaa on #ffffff ≈ 2.32 : 1 — fails AA
    expect(meetsWcag('#aaaaaa', '#ffffff', 'normal')).toBe(false);
  });

  it('passes AA Large for ratio ≥ 3 with large text', () => {
    // #767676 on #ffffff ≈ 4.48 : 1 — AA Large for large text
    expect(meetsWcag('#767676', '#ffffff', 'large')).toBe(true);
  });

  it('returns false if either hex is invalid', () => {
    expect(meetsWcag('#bad', '#ffffff')).toBe(false);
    expect(meetsWcag('#ffffff', 'invalid')).toBe(false);
  });

  it('defaults to normal text size when size arg is omitted', () => {
    // Same as meetsWcag('#000000', '#ffffff', 'normal')
    expect(meetsWcag('#000000', '#ffffff')).toBe(true);
    expect(meetsWcag('#aaaaaa', '#ffffff')).toBe(false);
  });
});
