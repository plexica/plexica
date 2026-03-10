// @vitest-environment jsdom
// File: packages/ui/src/utils/__tests__/sanitize-css.test.ts
// T015-28: Unit tests for sanitizeCss() utility. Spec 015 FR-027, NFR-004.

import { describe, it, expect } from 'vitest';
import { sanitizeCss } from '../sanitize-css.js';

describe('sanitizeCss', () => {
  // ─── Valid CSS passes through ──────────────────────────────────────────────

  it('should return valid CSS unchanged', () => {
    const input = 'color: red; font-size: 14px;';
    const result = sanitizeCss(input);
    expect(result).toContain('color: red');
    expect(result).toContain('font-size: 14px');
  });

  it('should preserve safe HTTPS URL in CSS url() values', () => {
    const input = "background: url('https://cdn.example.com/bg.png');";
    const result = sanitizeCss(input);
    expect(result).toContain('https://cdn.example.com/bg.png');
  });

  // ─── Script injection stripping ───────────────────────────────────────────

  it('should strip </style> tags to prevent breaking out of style element', () => {
    const input = 'color: red;</style><script>alert(1)</script>';
    const result = sanitizeCss(input);
    expect(result).not.toContain('</style>');
    expect(result).not.toContain('<script>');
    expect(result).not.toContain('alert(1)');
  });

  it('should strip </STYLE> tag (case-insensitive)', () => {
    const input = 'color: blue;</STYLE><b>injected</b>';
    const result = sanitizeCss(input);
    expect(result).not.toContain('</STYLE>');
    expect(result).not.toContain('<b>');
  });

  // ─── CSS expression() stripping ──────────────────────────────────────────

  it('should strip CSS expression() calls (IE XSS vector)', () => {
    const input = 'width: expression(alert(1))';
    const result = sanitizeCss(input);
    expect(result).not.toContain('expression(');
    // expression prefix should be replaced but the rest neutralized
  });

  it('should strip expression with whitespace before parenthesis', () => {
    const input = 'color: expression  (evil())';
    const result = sanitizeCss(input);
    expect(result).not.toContain('expression');
  });

  // ─── javascript: URL stripping ───────────────────────────────────────────

  it('should strip javascript: scheme in url() CSS function values', () => {
    const input = "background: url('javascript:alert(1)')";
    const result = sanitizeCss(input);
    expect(result).not.toContain('javascript:');
  });

  it('should strip javascript: scheme with double quotes', () => {
    const input = 'background: url("javascript:void(0)")';
    const result = sanitizeCss(input);
    expect(result).not.toContain('javascript:');
  });

  // ─── @import stripping ───────────────────────────────────────────────────

  it('should strip @import rules', () => {
    const input = '@import url("https://evil.com/steal.css"); color: red;';
    const result = sanitizeCss(input);
    // @import token must be fully removed (replaced with empty string)
    expect(result).not.toMatch(/@import/);
    // The rest of the CSS should still be present
    expect(result).toContain('color: red');
  });

  // ─── Performance (NFR-004) ────────────────────────────────────────────────

  it('should process a 50KB CSS string in under 5ms (NFR-004)', () => {
    // Generate a large but valid CSS string (~50KB)
    const chunk = 'color: red; background: blue; font-size: 14px; margin: 0; padding: 0; ';
    const bigCss = chunk.repeat(Math.ceil((50 * 1024) / chunk.length));

    const start = performance.now();
    sanitizeCss(bigCss);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(5);
  });

  // ─── Edge cases ───────────────────────────────────────────────────────────

  it('should return empty string for empty input', () => {
    expect(sanitizeCss('')).toBe('');
  });

  it('should return empty string for non-string input', () => {
    // @ts-expect-error intentional invalid input test
    expect(sanitizeCss(null)).toBe('');
    // @ts-expect-error intentional invalid input test
    expect(sanitizeCss(undefined)).toBe('');
  });
});
