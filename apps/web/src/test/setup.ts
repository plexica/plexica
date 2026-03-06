// apps/web/src/test/setup.ts
import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, vi, expect } from 'vitest';

// Clean up after each test
afterEach(() => {
  cleanup();
});

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(),
};
globalThis.localStorage = localStorageMock as unknown as Storage;

// Mock navigator.language (make it configurable so tests can override it)
Object.defineProperty(globalThis.navigator, 'language', {
  value: 'en-US',
  writable: true,
  configurable: true,
});

// vitest-axe: register toHaveNoViolations matcher globally.
// vitest-axe/extend-expect.js is intentionally empty due to an upstream package
// bug (https://github.com/chaance/vitest-axe/issues). We import the matchers
// directly and register them here so every test file gets them automatically
// without per-file boilerplate.
const vitestAxeMatchers = (await import('vitest-axe/matchers')) as unknown as {
  toHaveNoViolations: Parameters<typeof expect.extend>[0][string];
};
expect.extend({ toHaveNoViolations: vitestAxeMatchers.toHaveNoViolations });
