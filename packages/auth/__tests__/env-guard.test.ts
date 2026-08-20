import { describe, expect, it } from 'vitest';

import { requiredOrigin } from '../src/env-guard.js';

const DEV_FALLBACK = 'http://localhost:8080';
const PROD_ORIGIN = 'https://id.example.com';
const NAME = 'VITE_KEYCLOAK_URL';

describe('requiredOrigin()', () => {
  it('returns the provided value in a production build', () => {
    expect(requiredOrigin(PROD_ORIGIN, NAME, DEV_FALLBACK, true)).toBe(PROD_ORIGIN);
  });

  it('throws in production when the value is undefined, naming the variable', () => {
    expect(() => requiredOrigin(undefined, NAME, DEV_FALLBACK, true)).toThrow(/VITE_KEYCLOAK_URL/);
  });

  it('throws in production when the value is an empty string (treated as absent)', () => {
    expect(() => requiredOrigin('', NAME, DEV_FALLBACK, true)).toThrow(/VITE_KEYCLOAK_URL/);
  });

  it('never falls back to the dev origin in a production build', () => {
    for (const absent of [undefined, '']) {
      expect(() => requiredOrigin(absent, NAME, DEV_FALLBACK, true)).toThrow(
        /refusing to fall back/
      );
    }
  });

  it('falls back to the dev origin outside production when the value is missing', () => {
    expect(requiredOrigin(undefined, NAME, DEV_FALLBACK, false)).toBe(DEV_FALLBACK);
    expect(requiredOrigin('', NAME, DEV_FALLBACK, false)).toBe(DEV_FALLBACK);
  });

  it('returns the provided value outside production', () => {
    expect(requiredOrigin(PROD_ORIGIN, NAME, DEV_FALLBACK, false)).toBe(PROD_ORIGIN);
  });
});
