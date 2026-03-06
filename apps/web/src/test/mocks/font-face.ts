// apps/web/src/test/mocks/font-face.ts
//
// FontFace API mock for unit tests (T010-30).
//
// The jsdom test environment does not implement the browser FontFace API,
// so any code that calls `new FontFace(...)` or `document.fonts.*` will
// fail without this mock.
//
// Usage (call once in a describe block or in setupTests.ts):
//
//   import { mockFontFaceAPI, resetFontFaceAPIMock } from '@/test/mocks/font-face';
//
//   beforeAll(() => mockFontFaceAPI());
//   afterEach(() => resetFontFaceAPIMock());

import { vi } from 'vitest';

// Track which fonts have been "loaded" so deduplication logic can be tested.
const loadedFonts = new Set<string>();

// A minimal FontFace-like object returned by the mock constructor.
class MockFontFace {
  readonly family: string;
  readonly source: string;
  readonly descriptors: FontFaceDescriptors;
  readonly status: FontFaceLoadStatus = 'unloaded';
  readonly loaded: Promise<FontFace> = Promise.resolve(this as unknown as FontFace);

  constructor(family: string, source: string, descriptors: FontFaceDescriptors = {}) {
    this.family = family;
    this.source = typeof source === 'string' ? source : '';
    this.descriptors = descriptors;
  }

  load(): Promise<FontFace> {
    return Promise.resolve(this as unknown as FontFace);
  }
}

// FontFaceSet stub
class MockFontFaceSet extends EventTarget {
  private _fonts = new Set<MockFontFace>();

  add(font: MockFontFace): this {
    this._fonts.add(font);
    loadedFonts.add(`${font.family}-${font.descriptors?.weight ?? '400'}`);
    return this;
  }

  check(font: string): boolean {
    // Simple check: return true if the font family (without size prefix) has been loaded.
    // E.g., '12px Inter' → 'Inter'
    const match = font.match(/\s+(.+)$/);
    const family = match ? match[1].replace(/['"]/g, '').toLowerCase() : '';
    return (
      loadedFonts.has(family) || [...loadedFonts].some((f) => f.toLowerCase().startsWith(family))
    );
  }

  forEach(callback: (value: MockFontFace) => void): void {
    this._fonts.forEach(callback);
  }

  [Symbol.iterator](): Iterator<MockFontFace> {
    return this._fonts[Symbol.iterator]();
  }

  get size(): number {
    return this._fonts.size;
  }
}

let originalFontFace: typeof FontFace | undefined;
let originalDocumentFonts: FontFaceSet | undefined;

/**
 * Install the FontFace API mock. Call once per test file (e.g. in beforeAll).
 */
export function mockFontFaceAPI(): void {
  originalFontFace = globalThis.FontFace;
  originalDocumentFonts = document.fonts;

  // Replace the global FontFace constructor.
  globalThis.FontFace = MockFontFace as unknown as typeof FontFace;

  // Replace document.fonts with our stub.
  Object.defineProperty(document, 'fonts', {
    value: new MockFontFaceSet(),
    writable: true,
    configurable: true,
  });
}

/**
 * Reset the mock state between tests (does NOT restore originals).
 * Use after each test to clear the loaded-font registry.
 */
export function resetFontFaceAPIMock(): void {
  loadedFonts.clear();
  Object.defineProperty(document, 'fonts', {
    value: new MockFontFaceSet(),
    writable: true,
    configurable: true,
  });
}

/**
 * Restore the original FontFace API. Call in afterAll if needed.
 */
export function restoreFontFaceAPI(): void {
  if (originalFontFace !== undefined) {
    globalThis.FontFace = originalFontFace;
  }
  if (originalDocumentFonts !== undefined) {
    Object.defineProperty(document, 'fonts', {
      value: originalDocumentFonts,
      writable: true,
      configurable: true,
    });
  }
  loadedFonts.clear();
}

/**
 * Spy factory: returns a vi.fn() that resolves/rejects on demand.
 * Useful for testing font-loader error paths.
 */
export function createFontFaceLoadSpy(shouldFail = false): ReturnType<typeof vi.fn> {
  return vi.fn().mockImplementation(() => ({
    load: shouldFail
      ? () => Promise.reject(new Error('Font load failed'))
      : () => Promise.resolve({ family: 'MockFont' }),
  }));
}
