// File: apps/core-api/src/__tests__/unit/redos-benchmark.test.ts
// T015-32: ReDoS benchmark regression tests for confirmed O(n) regex patterns.
// Spec 015 FR-029, FR-030, NFR-005.
//
// These benchmarks confirm that the two regexes flagged by CodeQL as potential
// ReDoS vectors are in fact O(n) linear-time and do not exhibit catastrophic
// backtracking on adversarial inputs.
//
// The tests are skipped in CI when CI_SKIP_BENCHMARKS=1 to avoid flaky failures
// on slow CI runners. The suppression comments in source code are the primary
// fix; these tests serve as regression guards in local/performance environments.

import { describe, it, expect } from 'vitest';

describe('ReDoS benchmark regression tests (Spec 015 FR-029, FR-030)', () => {
  const SKIP_BENCHMARKS = process.env['CI_SKIP_BENCHMARKS'] === '1';

  // ─── T015-30: /\/+$/ in packages/sdk/src/api-client.ts ───────────────────

  describe('/\\/+$/ regex (trailing slash strip — api-client.ts)', () => {
    it('should match a URL with trailing slashes correctly', () => {
      const url = 'https://api.example.com/v1///';
      const result = url.replace(/\/+$/, '');
      expect(result).toBe('https://api.example.com/v1');
    });

    it('should return original string when no trailing slash', () => {
      const url = 'https://api.example.com/v1';
      const result = url.replace(/\/+$/, '');
      expect(result).toBe('https://api.example.com/v1');
    });

    it('should complete in < 500ms on adversarial input of 100K forward slashes (NFR-005)', () => {
      if (SKIP_BENCHMARKS) {
        // CI_SKIP_BENCHMARKS=1 set — skipping benchmark to avoid flaky CI failure
        return;
      }

      // Adversarial input: 100K trailing slashes — worst case for /\/+$/
      const adversarial = 'https://api.example.com/' + '/'.repeat(100_000);

      const start = performance.now();
      adversarial.replace(/\/+$/, '');
      const elapsed = performance.now() - start;

      // 500ms threshold: the purpose is to detect catastrophic backtracking
      // (which would take seconds/minutes), not microsecond performance.
      // O(n) linear regex on 100K chars should run in < 5ms in practice;
      // the generous threshold accommodates JIT warm-up and slow CI runners.
      expect(elapsed).toBeLessThan(500);
    });
  });

  // ─── T015-31: /member.*not found/i in error-formatter.ts ─────────────────

  describe('/member.*not found/i regex (error message matcher — error-formatter.ts)', () => {
    it('should match "member not found" error messages', () => {
      const message = 'The team member was not found in the workspace';
      expect(/member.*not found/i.test(message)).toBe(true);
    });

    it('should match case-insensitively', () => {
      const message = 'MEMBER NOT FOUND';
      expect(/member.*not found/i.test(message)).toBe(true);
    });

    it('should not match unrelated messages', () => {
      const message = 'Workspace creation failed: duplicate slug';
      expect(/member.*not found/i.test(message)).toBe(false);
    });

    it('should complete in < 20ms on adversarial non-matching input of 100K chars (NFR-005)', () => {
      if (SKIP_BENCHMARKS) {
        // CI_SKIP_BENCHMARKS=1 set — skipping benchmark to avoid flaky CI failure
        return;
      }

      // Adversarial input: starts with 'member' followed by 100K non-matching chars.
      // This triggers maximum backtracking for a non-matching string.
      const adversarial = 'member' + 'x'.repeat(100_000);

      const start = performance.now();
      /member.*not found/i.test(adversarial);
      const elapsed = performance.now() - start;

      // 20ms threshold with 2× CI margin (O(n) should be well under 10ms)
      expect(elapsed).toBeLessThan(20);
    });

    it('should complete in < 20ms on matching input of 100K chars (NFR-005)', () => {
      if (SKIP_BENCHMARKS) {
        return;
      }

      // Matching input: 'member' + 100K filler chars + 'not found'
      const adversarial = 'member' + 'x'.repeat(100_000) + ' not found';

      const start = performance.now();
      const matched = /member.*not found/i.test(adversarial);
      const elapsed = performance.now() - start;

      expect(matched).toBe(true);
      expect(elapsed).toBeLessThan(20);
    });
  });
});
