// base-fixture.ts
// Extends Playwright's base `test` with the fixes every E2E test needs.
//
// Page-level fixes (Google Fonts abort, page.goto, page.waitForURL) live in
// page-fixes.ts so that a test opening its own browser context gets exactly the
// same behaviour — see the rationale in that file.
//
// Fix 4 (context-level) — stale Keycloak SSO session across test runs:
//   Each test gets a fresh browser context (Playwright default), so
//   sessionStorage and cookies start clean. However, when reuseExistingServer is
//   true (local dev) and a Keycloak SSO session was established by an earlier
//   test in the same run, it survives via the KEYCLOAK_SESSION cookie on
//   localhost:8080. Clearing all cookies guarantees a logged-out start.

import { type Page, test as base } from '@playwright/test';

import { applyPageFixes, isolatedTestIp } from './page-fixes.js';

export const test = base.extend<{ page: Page }>({
  page: async ({ page, context }, use, testInfo) => {
    // Isolated client IP per test/retry — see isolatedTestIp().
    await context.setExtraHTTPHeaders({
      'X-Forwarded-For': isolatedTestIp(testInfo.testId, testInfo.retry),
    });

    // Fix 4 — clear all cookies before every test.
    await context.clearCookies();

    await applyPageFixes(page);

    await use(page);
  },
});

export { expect, type Page } from '@playwright/test';
