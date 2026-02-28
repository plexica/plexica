// File: apps/web/src/__tests__/theme/font-loader.test.ts
//
// T005-06: Unit tests for font-loader.ts

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// --- Mock @plexica/types so tests run without actual WOFF2 files ---
vi.mock('@plexica/types', () => {
  const FONT_CATALOG = [
    {
      id: 'inter',
      name: 'Inter',
      category: 'sans-serif',
      weights: [400, 500, 600, 700],
      license: 'SIL OFL 1.1',
      fallback: 'system-ui, -apple-system, sans-serif',
      files: { '400': 'inter/inter-400.woff2', '700': 'inter/inter-700.woff2' },
    },
    {
      id: 'roboto',
      name: 'Roboto',
      category: 'sans-serif',
      weights: [400, 500, 700],
      license: 'Apache 2.0',
      fallback: 'system-ui, -apple-system, sans-serif',
      files: { '400': 'roboto/roboto-400.woff2', '700': 'roboto/roboto-700.woff2' },
    },
    {
      id: 'merriweather',
      name: 'Merriweather',
      category: 'serif',
      weights: [400, 700],
      license: 'SIL OFL 1.1',
      fallback: "Georgia, 'Times New Roman', serif",
      files: {
        '400': 'merriweather/merriweather-400.woff2',
        '700': 'merriweather/merriweather-700.woff2',
      },
    },
  ];
  return {
    FONT_CATALOG,
    DEFAULT_HEADING_FONT: 'inter',
    DEFAULT_BODY_FONT: 'roboto',
    FONT_IDS: FONT_CATALOG.map((f) => f.id),
  };
});

// --- Mock FontFace API ---
const mockFontFaceLoad = vi.fn().mockResolvedValue(undefined);
const MockFontFace = vi.fn().mockImplementation((_name: string, _src: string, _opts?: object) => ({
  load: mockFontFaceLoad,
}));

// --- Mock document.fonts ---
const mockFontsAdd = vi.fn();
const mockFontsCheck = vi.fn().mockReturnValue(false);

// Apply globals before importing module under test
Object.defineProperty(globalThis, 'FontFace', { value: MockFontFace, writable: true });
Object.defineProperty(document, 'fonts', {
  value: { add: mockFontsAdd, check: mockFontsCheck },
  writable: true,
  configurable: true,
});

import { loadFonts, getManifest, isFontLoaded, _resetForTesting } from '@/lib/font-loader.js';

const MOCK_MANIFEST = {
  version: 1 as const,
  fonts: [
    {
      id: 'inter',
      name: 'Inter',
      category: 'sans-serif' as const,
      weights: [400, 700],
      license: 'SIL OFL 1.1',
      fallback: 'system-ui, sans-serif',
      files: { '400': 'inter/inter-400.woff2', '700': 'inter/inter-700.woff2' },
    },
  ],
};

describe('font-loader (T005-06)', () => {
  beforeEach(() => {
    _resetForTesting();
    MockFontFace.mockClear();
    mockFontFaceLoad.mockClear();
    mockFontsAdd.mockClear();
    mockFontsCheck.mockReturnValue(false);
    vi.spyOn(document.documentElement.style, 'setProperty').mockImplementation(() => {});
    // Default: successful manifest fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => MOCK_MANIFEST,
    } as Response);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls FontFace constructor for each weight of both fonts when heading !== body', async () => {
    await loadFonts({ heading: 'inter', body: 'roboto' });
    // inter has 4 weights (400,500,600,700 per mock) — but mock catalog has [400,500,600,700]
    // roboto has 3 weights [400,500,700]
    // Total: 4 + 3 = 7 FontFace calls
    expect(MockFontFace).toHaveBeenCalledWith(
      'Inter',
      expect.stringContaining('inter-400.woff2'),
      expect.objectContaining({ display: 'swap' })
    );
    expect(MockFontFace).toHaveBeenCalledWith(
      'Roboto',
      expect.stringContaining('roboto-400.woff2'),
      expect.objectContaining({ display: 'swap' })
    );
  });

  it('deduplicates when heading and body are the same font ID', async () => {
    await loadFonts({ heading: 'inter', body: 'inter' });
    // Should only load inter once — not twice
    const interCalls = MockFontFace.mock.calls.filter((c) => c[0] === 'Inter');
    const expectedWeights = [400, 500, 600, 700]; // per mock catalog
    expect(interCalls).toHaveLength(expectedWeights.length);
  });

  it('getManifest fetches /fonts/manifest.json once and returns cached result on subsequent calls', async () => {
    const first = await getManifest();
    const second = await getManifest();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(first).toBe(second); // same object reference
  });

  it('isFontLoaded returns true when document.fonts.check returns true', () => {
    mockFontsCheck.mockReturnValue(true);
    expect(isFontLoaded('Inter')).toBe(true);
    // Also works with font ID
    expect(isFontLoaded('inter')).toBe(true);
  });

  it('loadFonts falls back gracefully when FontFace.load() rejects — no throw, warns to console', async () => {
    mockFontFaceLoad.mockRejectedValue(new Error('Network error'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Should not throw
    await expect(loadFonts({ heading: 'inter', body: 'roboto' })).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('rejects invalid font ID with Zod validation before any FontFace call and falls back to default', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await loadFonts({ heading: 'not-a-real-font', body: 'roboto' });

    // Should have warned about the invalid font
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid heading font'));
    // FontFace should still be called for the fallback (inter) and body (roboto)
    expect(MockFontFace).toHaveBeenCalled();
  });
});
