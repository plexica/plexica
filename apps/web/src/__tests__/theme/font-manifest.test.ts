// File: apps/web/src/__tests__/theme/font-manifest.test.ts
//
// T005-14: Validates the font manifest JSON schema and content completeness.
// All 25 ADR-020 curated fonts must be present with required fields.

import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect, beforeAll } from 'vitest';

const MANIFEST_PATH = join(__dirname, '../../../..', 'public/fonts/manifest.json');

interface FontEntry {
  id: string;
  name: string;
  category: string;
  weights: number[];
  license: string;
  fallback: string;
  files: Record<string, string>;
}

interface FontManifest {
  version: number;
  fonts: FontEntry[];
}

// All 25 curated font IDs per ADR-020
const ADR_020_FONT_IDS = [
  'inter',
  'roboto',
  'open-sans',
  'lato',
  'source-sans-3',
  'nunito',
  'poppins',
  'work-sans',
  'dm-sans',
  'plus-jakarta-sans',
  'noto-sans',
  'manrope',
  'figtree',
  'merriweather',
  'playfair-display',
  'lora',
  'source-serif-4',
  'bitter',
  'jetbrains-mono',
  'fira-code',
  'source-code-pro',
  'outfit',
  'space-grotesk',
  'sora',
  'rubik',
  'raleway',
];

describe('Font Manifest (T005-14)', () => {
  let manifest: FontManifest;

  beforeAll(() => {
    const raw = readFileSync(MANIFEST_PATH, 'utf-8');
    manifest = JSON.parse(raw) as FontManifest;
  });

  it('is valid JSON with version=1 and a fonts array', () => {
    expect(manifest.version).toBe(1);
    expect(Array.isArray(manifest.fonts)).toBe(true);
  });

  it('contains exactly 25 font families matching the ADR-020 curated list', () => {
    expect(manifest.fonts).toHaveLength(25);
    const ids = manifest.fonts.map((f) => f.id);
    for (const expectedId of ADR_020_FONT_IDS) {
      expect(ids).toContain(expectedId);
    }
  });

  it('every font entry has all required fields with correct types', () => {
    for (const font of manifest.fonts) {
      expect(typeof font.id).toBe('string');
      expect(font.id.length).toBeGreaterThan(0);

      expect(typeof font.name).toBe('string');
      expect(font.name.length).toBeGreaterThan(0);

      expect(['sans-serif', 'serif', 'monospace', 'display']).toContain(font.category);

      expect(Array.isArray(font.weights)).toBe(true);
      expect(font.weights.length).toBeGreaterThan(0);
      for (const w of font.weights) {
        expect(typeof w).toBe('number');
        expect([100, 200, 300, 400, 500, 600, 700, 800, 900]).toContain(w);
      }

      expect(['SIL OFL 1.1', 'Apache 2.0']).toContain(font.license);

      expect(typeof font.fallback).toBe('string');
      expect(font.fallback.length).toBeGreaterThan(0);

      expect(typeof font.files).toBe('object');
      for (const weight of font.weights) {
        const key = String(weight);
        expect(font.files[key]).toBeDefined();
        expect(font.files[key]).toMatch(new RegExp(`^${font.id}/${font.id}-${weight}\\.woff2$`));
      }
    }
  });

  it('all file paths follow the {id}/{id}-{weight}.woff2 pattern', () => {
    for (const font of manifest.fonts) {
      for (const [weight, path] of Object.entries(font.files)) {
        expect(path).toMatch(/^[a-z0-9-]+\/[a-z0-9-]+-\d+\.woff2$/);
        expect(path).toBe(`${font.id}/${font.id}-${weight}.woff2`);
      }
    }
  });

  it('default fonts inter and roboto are present at weight 400', () => {
    const inter = manifest.fonts.find((f) => f.id === 'inter');
    const roboto = manifest.fonts.find((f) => f.id === 'roboto');

    expect(inter).toBeDefined();
    expect(inter!.weights).toContain(400);
    expect(inter!.files['400']).toBe('inter/inter-400.woff2');

    expect(roboto).toBeDefined();
    expect(roboto!.weights).toContain(400);
    expect(roboto!.files['400']).toBe('roboto/roboto-400.woff2');
  });
});
