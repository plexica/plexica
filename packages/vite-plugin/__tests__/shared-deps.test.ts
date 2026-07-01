// shared-deps.test.ts

import { describe, expect, it } from 'vitest';

import { SHARED_DEPS } from '../src/shared-deps.js';

describe('SHARED_DEPS', () => {
  it('includes react as singleton', () => {
    expect(SHARED_DEPS.react.singleton).toBe(true);
    expect(SHARED_DEPS.react.requiredVersion).toBe('^19.0.0');
  });

  it('includes react-dom as singleton', () => {
    expect(SHARED_DEPS['react-dom'].singleton).toBe(true);
    expect(SHARED_DEPS['react-dom'].requiredVersion).toBe('^19.0.0');
  });

  it('includes @tanstack/react-query as singleton', () => {
    expect(SHARED_DEPS['@tanstack/react-query'].singleton).toBe(true);
  });

  it('includes @plexica/ui as singleton', () => {
    expect(SHARED_DEPS['@plexica/ui'].singleton).toBe(true);
  });

  it('all deps are singleton=true', () => {
    for (const [, value] of Object.entries(SHARED_DEPS)) {
      expect(value.singleton).toBe(true);
    }
  });

  it('all deps specify requiredVersion', () => {
    for (const [, value] of Object.entries(SHARED_DEPS)) {
      expect(value.requiredVersion).toBeDefined();
    }
  });

  it('all deps have eager=false', () => {
    for (const [, value] of Object.entries(SHARED_DEPS)) {
      expect(value.eager).toBe(false);
    }
  });
});
