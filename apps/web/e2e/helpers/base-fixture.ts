// base-fixture.ts
// Extends Playwright's base `test` with global fixes for all E2E tests:
//
// Fix 1 — Google Fonts blocks load event (safety net):
//   The `@plexica/ui` package previously imported Inter from fonts.googleapis.com.
//   That import has been replaced with `@fontsource/inter` (self-hosted), but we
//   keep the route abort handler as a safety net in case any Keycloak page or
//   other dependency tries to load from Google Fonts CDN.
//
// Fix 2 — page.goto hangs waiting for 'load' event:
//   The default waitUntil: 'load' for page.goto never fires when:
//   (a) The page does window.location.href to Keycloak before all resources load.
//       This aborts the original navigation, so the 'load' event is never fired.
//   (b) Vite's HMR WebSocket keeps the connection open.
//   Solution: override page.goto to use waitUntil: 'domcontentloaded'.
//
// Fix 3 — page.waitForURL aborts with 'load' event on Keycloak redirect:
//   After goto('/?tenant=e2e') with domcontentloaded, the React app calls
//   window.location.href = keycloakUrl. page.waitForURL with default waitUntil:
//   'load' waits for the full load of the Keycloak page. If the Keycloak page
//   itself triggers a further redirect (e.g. SSO already active), the 'load'
//   wait is aborted. Also, Playwright's internal navigation lock conflict between
//   a still-pending domcontentloaded goto and the subsequent window.location.href
//   navigation can cause net::ERR_ABORTED.
//   Fix: for Keycloak redirect patterns (URL contains 'realms' or ':8080'), use
//   polling to avoid the ERR_ABORTED race. For all other patterns (same-domain
//   SPA navigations via TanStack Router), pass through to Playwright's default
//   waitForURL — no waitUntil override, since client-side History API navigations
//   do not fire 'domcontentloaded' events and the default behavior is correct.
//
// Fix 4 — Stale Keycloak SSO session across test runs:
//   Each test gets a fresh browser context (Playwright default), so sessionStorage
//   and cookies start clean. However, when reuseExistingServer is true (local dev)
//   and a Keycloak SSO session was set in an earlier test in the same run, it
//   persists via the KEYCLOAK_SESSION cookie at localhost:8080. Clearing all
//   cookies ensures a clean logout state.

import { type Page, test as base } from '@playwright/test';

export const test = base.extend<{ page: Page }>({
  page: async ({ page, context }, use) => {
    // Fix 4 — clear all cookies before every test.
    await context.clearCookies();

    // Fix 1 — abort Google Fonts requests as a safety net.
    await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
    await page.route('https://fonts.gstatic.com/**', (route) => route.abort());

    // Fix 2 — override page.goto to default to domcontentloaded.
    const originalGoto = page.goto.bind(page);
    page.goto = async (url: string, options?: Parameters<Page['goto']>[1]) => {
      return originalGoto(url, { waitUntil: 'domcontentloaded', ...options });
    };

    // Fix 3 — override page.waitForURL to poll instead of event-based tracking.
    // The event-based waitForURL propagates net::ERR_ABORTED when intermediate
    // SPA navigations (/ → /dashboard) are aborted by the subsequent Keycloak
    // window.location.href redirect. Polling avoids this by simply checking the
    // current URL until it matches — no dependence on specific navigation events.
    // After the URL matches, we wait for 'domcontentloaded' so the page DOM is
    // ready for subsequent locator interactions (e.g. filling username inputs).
    const originalWaitForURL = page.waitForURL.bind(page);
    page.waitForURL = async (
      urlOrPredicate: Parameters<Page['waitForURL']>[0],
      options?: Parameters<Page['waitForURL']>[1]
    ) => {
      // For string/regex patterns that include 'realms' (Keycloak redirect),
      // use polling to avoid the ERR_ABORTED race. For all other patterns,
      // use the standard waitForURL (which works fine for same-domain SPA navs).
      const patternStr = urlOrPredicate.toString();
      if (patternStr.includes('realms') || patternStr.includes('8080')) {
        const timeout = options?.timeout ?? 30_000;
        const deadline = Date.now() + timeout;
        while (Date.now() < deadline) {
          const currentUrl = page.url();
          const matches =
            (typeof urlOrPredicate === 'string' && currentUrl === urlOrPredicate) ||
            (urlOrPredicate instanceof RegExp && urlOrPredicate.test(currentUrl)) ||
            (typeof urlOrPredicate === 'function' && urlOrPredicate(new URL(currentUrl)));
          if (matches) {
            // URL matched — wait for domcontentloaded so DOM is ready for interactions
            await page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => {
              // Best-effort: some Keycloak redirects may not fire domcontentloaded
              // in time (e.g. instant SSO redirect). Proceed anyway.
            });
            return;
          }
          await page.waitForTimeout(100);
        }
        throw new Error(
          `page.waitForURL: Timeout ${String(timeout)}ms exceeded waiting for URL matching ${patternStr}`
        );
      }
      return originalWaitForURL(urlOrPredicate, { waitUntil: 'commit', ...options });
    };

    await use(page);
  },
});

export { expect, type Page } from '@playwright/test';
