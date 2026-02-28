// File: apps/web/src/lib/contrast-utils.ts
//
// WCAG 2.1 contrast-ratio utilities for the tenant theme settings UI.
//
// Implements the W3C contrast ratio algorithm:
//   https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio
//
// Public API:
//   hexToRgb(hex)              → { r, g, b } | null
//   relativeLuminance(r, g, b) → 0–1
//   contrastRatio(hex1, hex2)  → 1–21 (or null if either hex is invalid)
//   wcagLevel(ratio)           → 'AAA' | 'AA' | 'AA Large' | 'Fail'
//   meetsWcag(hex1, hex2, level, size) → boolean

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WcagLevel = 'AAA' | 'AA' | 'AA Large' | 'Fail';
export type TextSize = 'normal' | 'large';

// ---------------------------------------------------------------------------
// hexToRgb
// ---------------------------------------------------------------------------

/**
 * Parse a CSS hex color (#rgb, #rrggbb, #rrggbbaa) into linear 0–255 channels.
 * Alpha is ignored for luminance calculations.
 * Returns null if the input is not a valid hex color.
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  if (typeof hex !== 'string') return null;
  const cleaned = hex.trim().replace(/^#/, '');

  let r: number, g: number, b: number;

  if (cleaned.length === 3 || cleaned.length === 4) {
    // #rgb or #rgba → expand each nibble
    r = parseInt(cleaned[0] + cleaned[0], 16);
    g = parseInt(cleaned[1] + cleaned[1], 16);
    b = parseInt(cleaned[2] + cleaned[2], 16);
  } else if (cleaned.length === 6 || cleaned.length === 8) {
    r = parseInt(cleaned.slice(0, 2), 16);
    g = parseInt(cleaned.slice(2, 4), 16);
    b = parseInt(cleaned.slice(4, 6), 16);
  } else {
    return null;
  }

  if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
  return { r, g, b };
}

// ---------------------------------------------------------------------------
// relativeLuminance
// ---------------------------------------------------------------------------

/**
 * Compute relative luminance for an sRGB color (0–255 channels).
 * Formula: https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
export function relativeLuminance(r: number, g: number, b: number): number {
  const linearise = (channel: number): number => {
    const sRGB = channel / 255;
    return sRGB <= 0.03928 ? sRGB / 12.92 : Math.pow((sRGB + 0.055) / 1.055, 2.4);
  };
  const R = linearise(r);
  const G = linearise(g);
  const B = linearise(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

// ---------------------------------------------------------------------------
// contrastRatio
// ---------------------------------------------------------------------------

/**
 * Compute the WCAG 2.1 contrast ratio between two hex colors.
 * Returns a value in the range [1, 21], or null if either input is invalid.
 */
export function contrastRatio(hex1: string, hex2: string): number | null {
  const rgb1 = hexToRgb(hex1);
  const rgb2 = hexToRgb(hex2);
  if (!rgb1 || !rgb2) return null;

  const L1 = relativeLuminance(rgb1.r, rgb1.g, rgb1.b);
  const L2 = relativeLuminance(rgb2.r, rgb2.g, rgb2.b);

  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ---------------------------------------------------------------------------
// wcagLevel
// ---------------------------------------------------------------------------

/**
 * Classify a contrast ratio into a WCAG 2.1 conformance level.
 *
 * WCAG thresholds:
 *   ratio ≥ 7   → AAA (enhanced)
 *   ratio ≥ 4.5 → AA  (minimum for normal text)
 *   ratio ≥ 3   → AA Large (large text / UI components)
 *   ratio < 3   → Fail
 */
export function wcagLevel(ratio: number): WcagLevel {
  if (ratio >= 7) return 'AAA';
  if (ratio >= 4.5) return 'AA';
  if (ratio >= 3) return 'AA Large';
  return 'Fail';
}

// ---------------------------------------------------------------------------
// meetsWcag
// ---------------------------------------------------------------------------

/**
 * Returns true when the contrast between `foreground` and `background` meets
 * the WCAG 2.1 minimum for the given text size.
 *
 *   normal text  → requires AA (≥ 4.5 : 1)
 *   large text   → requires AA Large (≥ 3 : 1)
 *
 * Large text is defined by WCAG as ≥ 18pt (24px) regular or ≥ 14pt (18.67px) bold.
 */
export function meetsWcag(
  foreground: string,
  background: string,
  size: TextSize = 'normal'
): boolean {
  const ratio = contrastRatio(foreground, background);
  if (ratio === null) return false;
  return size === 'large' ? ratio >= 3 : ratio >= 4.5;
}
