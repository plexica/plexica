// base-fixture.ts
// Extends Playwright's base `test` with admin-app-specific fixes for all E2E
// tests. Mirrors the apps/web fixture but simplified — the admin app uses a
// React login form (no Keycloak browser redirect flow), so the complex
// waitForURL polling workaround for /realms/ redirects is NOT needed here.
//
// Fix 1 — Google Fonts blocks load event (safety net):
//   @plexica/ui previously imported Inter from fonts.googleapis.com. That
//   import was replaced with self-hosted @fontsource/inter, but we keep the
//   route abort handler as a safety net for any stray CDN dependency.
//
// Fix 2 — page.goto hangs waiting for 'load' event:
//   Vite's HMR WebSocket keeps the connection open, so the default
//   waitUntil: 'load' for page.goto never fires. Override to use
//   'domcontentloaded' so navigations resolve promptly.
//
// Fix 3 — Stale session across test runs:
//   Each test gets a fresh browser context (Playwright default), so
//   sessionStorage and cookies start clean. Clearing all cookies ensures a
//   clean logout state when reuseExistingServer is true (local dev).

import { type Page, test as base } from '@playwright/test';

export const test = base.extend<{ page: Page }>({
  page: async ({ page, context }, use) => {
    // Fix 3 — clear all cookies before every test.
    await context.clearCookies();

    // Fix 1 — abort Google Fonts requests as a safety net.
    await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
    await page.route('https://fonts.gstatic.com/**', (route) => route.abort());

    // Fix 2 — override page.goto to default to domcontentloaded.
    const originalGoto = page.goto.bind(page);
    page.goto = async (url: string, options?: Parameters<Page['goto']>[1]) => {
      return originalGoto(url, { waitUntil: 'domcontentloaded', ...options });
    };

    await use(page);
  },
});

export { expect, type Page } from '@playwright/test';
