// svg-timing.ts
// Shared timing helpers for assertSafeSvg() performance tests. Test-only:
// nothing here is exported for production use.

import { expect } from 'vitest';

import { InvalidFileTypeError } from '../../../lib/app-error.js';
import { assertSafeSvg } from '../../../lib/svg-safety.js';

// Generous hang-guard: catches quadratic blowups (minutes) while absorbing
// shared-runner noise (observed 5.4s under load). Single budget for all
// environments — the unit project's testTimeout (10s) would kill the test
// before any larger CI budget could ever fire.
export const SVG_PERF_BUDGET_MS = 8_000;

// Wall-clock guard that a rejection completes well inside the budget.
export const assertRejectFast = (payload: Buffer): void => {
  const start = performance.now();
  expect(() => assertSafeSvg(payload)).toThrow(InvalidFileTypeError);
  expect(performance.now() - start).toBeLessThan(SVG_PERF_BUDGET_MS);
};

// Monotonic sub-ms timing of a single parse (performance.now(), no floor hack).
export const timed = (payload: Buffer): number => {
  const start = performance.now();
  assertSafeSvg(payload);
  return performance.now() - start;
};

// Statistical scaling assertion: t(factor*N) < maxRatio * t(N).
// Linear parsing gives a ratio ~factor, quadratic ~factor^2 or worse.
// Warmup runs at BOTH sizes (JIT/GC), then the median of 3 measurements per
// size — and small is always measured before big, so JIT warm-up on the
// second size cannot bias the ratio. Shared-runner noise mostly cancels
// (both sizes slow down together).
export const assertLinearScaling = (
  buildPayload: (n: number) => Buffer,
  smallN: number,
  factor = 4,
  maxRatio = 12
): void => {
  const bigN = smallN * factor;
  timed(buildPayload(smallN)); // warmup, unmeasured
  timed(buildPayload(bigN)); // warmup, unmeasured
  const median = (samples: Array<number>): number => [...samples].sort((a, b) => a - b)[1] ?? 0;
  const small = median([
    timed(buildPayload(smallN)),
    timed(buildPayload(smallN)),
    timed(buildPayload(smallN)),
  ]);
  const big = median([
    timed(buildPayload(bigN)),
    timed(buildPayload(bigN)),
    timed(buildPayload(bigN)),
  ]);
  expect(big).toBeLessThan(maxRatio * small);
};
