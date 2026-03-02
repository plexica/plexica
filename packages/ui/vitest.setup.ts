/// <reference lib="dom" />
import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Clean up after each test case
afterEach(() => {
  cleanup();
});

// ─── Radix UI jsdom polyfills ─────────────────────────────────────────────────
//
// Radix UI primitives (Select, Tabs, Dropdown, Dialog, Toast, etc.) rely on
// several browser APIs that jsdom does not implement. Without these polyfills
// the first test in each affected file hangs for the full 5 s timeout because
// Radix's internal positioning / measurement code waits for a callback that
// never fires.

// ResizeObserver — used by Select (viewport sizing), Tabs (indicator),
// DropdownMenu / Dialog / Toast (content positioning).
// @floating-ui/dom calls `new ResizeObserver(cb)`, so this MUST be a real
// class (function used as constructor), not a plain arrow-function mock.
if (!globalThis.ResizeObserver) {
  class ResizeObserverMock {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    constructor(_callback: ResizeObserverCallback) {}
  }
  globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
}

// window.matchMedia — used by Radix media-query hooks and some animation
// utilities that check for reduced-motion preferences.
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(), // deprecated but still called by some libs
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

// PointerEvent APIs — Radix Select and DropdownMenu check these on trigger
// elements during pointer-down handling.
if (!HTMLElement.prototype.hasPointerCapture) {
  HTMLElement.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
}
if (!HTMLElement.prototype.setPointerCapture) {
  HTMLElement.prototype.setPointerCapture = vi.fn();
}
if (!HTMLElement.prototype.releasePointerCapture) {
  HTMLElement.prototype.releasePointerCapture = vi.fn();
}
// scrollIntoView — called by Radix Select when scrolling to the selected item.
if (!HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = vi.fn();
}
