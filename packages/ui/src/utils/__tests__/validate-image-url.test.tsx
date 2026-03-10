// @vitest-environment jsdom
// File: packages/ui/src/utils/__tests__/validate-image-url.test.ts
// T015-29: Unit tests for validateImageUrl() and <SafeImage>. Spec 015 FR-028.

import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { validateImageUrl } from '../validate-image-url.js';
import { SafeImage } from '../../components/SafeImage/SafeImage.js';

describe('validateImageUrl', () => {
  // ─── Allowed schemes ──────────────────────────────────────────────────────

  it('should return the URL for https:// URLs', () => {
    const url = 'https://cdn.example.com/logo.png';
    expect(validateImageUrl(url)).toBe(url);
  });

  it('should return the URL for http:// URLs', () => {
    const url = 'http://cdn.example.com/logo.png';
    expect(validateImageUrl(url)).toBe(url);
  });

  it('should return the URL for data:image/ URLs (base64 images)', () => {
    const url = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ';
    expect(validateImageUrl(url)).toBe(url);
  });

  // ─── Rejected schemes ─────────────────────────────────────────────────────

  it('should return null for javascript: URLs', () => {
    expect(validateImageUrl('javascript:alert(1)')).toBeNull();
  });

  it('should return null for JAVASCRIPT: (uppercase) URLs', () => {
    expect(validateImageUrl('JAVASCRIPT:alert(1)')).toBeNull();
  });

  it('should return null for data:text/html URLs', () => {
    expect(validateImageUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
  });

  it('should return null for data:application/ URLs', () => {
    expect(validateImageUrl('data:application/json,{"key":"value"}')).toBeNull();
  });

  it('should return null for unknown/unsupported schemes', () => {
    expect(validateImageUrl('ftp://example.com/image.png')).toBeNull();
    expect(validateImageUrl('file:///etc/passwd')).toBeNull();
    expect(validateImageUrl('vbscript:msgbox(1)')).toBeNull();
  });

  // ─── Empty / nullish inputs ───────────────────────────────────────────────

  it('should return null for empty string', () => {
    expect(validateImageUrl('')).toBeNull();
  });

  it('should return null for whitespace-only string', () => {
    expect(validateImageUrl('   ')).toBeNull();
  });

  // ─── Preserves original case ──────────────────────────────────────────────

  it('should return the original URL (not lowercased)', () => {
    const url = 'https://CDN.Example.COM/Logo.PNG';
    expect(validateImageUrl(url)).toBe(url);
  });
});

describe('SafeImage', () => {
  // ─── Safe URLs render an <img> ────────────────────────────────────────────

  it('should render an <img> element for a valid https:// URL', () => {
    render(<SafeImage src="https://example.com/logo.png" alt="Logo" />);
    const img = screen.getByRole('img') as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.getAttribute('src')).toBe('https://example.com/logo.png');
  });

  // ─── Unsafe URLs render fallback / nothing ────────────────────────────────

  it('should NOT render an <img> for a javascript: URL', () => {
    const { container } = render(<SafeImage src="javascript:alert(1)" />);
    expect(container.querySelector('img')).toBeNull();
  });

  it('should render the fallback for a javascript: URL', () => {
    render(
      <SafeImage
        src="javascript:alert(1)"
        fallback={<span data-testid="fallback">Invalid</span>}
      />
    );
    expect(screen.getByTestId('fallback')).toBeTruthy();
    expect(document.querySelector('img')).toBeNull();
  });

  it('should render nothing (null) for an empty src with no fallback', () => {
    const { container } = render(<SafeImage src="" />);
    expect(container.firstChild).toBeNull();
  });

  // ─── Props are forwarded ──────────────────────────────────────────────────

  it('should forward additional img props (alt, className) to <img>', () => {
    render(
      <SafeImage src="https://example.com/a.png" alt="My image" className="custom-class" />
    );
    const img = screen.getByRole('img') as HTMLImageElement;
    expect(img.getAttribute('alt')).toBe('My image');
    expect(img.className).toContain('custom-class');
  });
});
