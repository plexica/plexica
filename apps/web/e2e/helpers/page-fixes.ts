// page-fixes.ts
// Page-level workarounds shared by the base fixture AND by any extra browser
// context a test opens itself (e.g. a second user's session in
// user-removal.spec.ts).
//
// They used to live inline in base-fixture.ts, which meant a page created with
// `browser.newContext()` silently lost all of them: `page.goto()` hangs on the
// Keycloak redirect (Fix 2) and `page.waitForURL(/\/realms\//)` fails with
// net::ERR_ABORTED (Fix 3). Extracting them keeps ONE definition (Constitution
// Rule 3) instead of a fixture path and a hand-rolled path that drift apart.
//
// Fix 1 — Google Fonts blocks the load event (safety net):
//   `@plexica/ui` previously imported Inter from fonts.googleapis.com. That
//   import is now `@fontsource/inter` (self-hosted), but the abort handler stays
//   as a safety net for any Keycloak page still reaching the Google CDN.
//
// Fix 2 — page.goto hangs waiting for the 'load' event:
//   The default `waitUntil: 'load'` never fires when (a) the page does
//   window.location.href to Keycloak before all resources load — aborting the
//   original navigation — or (b) Vite's HMR WebSocket keeps the connection open.
//   Solution: default page.goto to `waitUntil: 'domcontentloaded'`.
//
// Fix 3 — page.waitForURL aborts with the 'load' event on the Keycloak redirect:
//   After goto('/?tenant=e2e') with domcontentloaded, the React app assigns
//   window.location.href = keycloakUrl. waitForURL's default `waitUntil: 'load'`
//   waits for the full load of the Keycloak page; a further redirect (SSO already
//   active) aborts that wait. Playwright's navigation lock can also surface
//   net::ERR_ABORTED between the pending goto and the location assignment.
//   Fix: poll for Keycloak redirect patterns (URL contains 'realms' or ':8080').
//   Everything else (same-domain TanStack Router navigations) passes through to
//   Playwright's implementation, since History API navigations never fire
//   'domcontentloaded'.

import { createHash } from 'node:crypto';

import type { Page } from '@playwright/test';

/**
 * Deterministic documentation-range client IP for a test/retry.
 *
 * The E2E core-api trusts exactly one proxy hop, so an isolated X-Forwarded-For
 * keeps public-endpoint rate-limit budgets from leaking between otherwise
 * independent browser contexts. `seed` is free-form: a test that opens a second
 * context passes a distinct one (e.g. `${testId}:victim`) to get its own budget.
 */
export function isolatedTestIp(seed: string, retry: number): string {
  const runId = process.env['PLAYWRIGHT_E2E_KEYCLOAK_CLIENT_UUID'] ?? String(process.pid);
  const bytes = createHash('sha256')
    .update(`${runId}:${seed}:${String(retry)}`)
    .digest();
  return `198.${18 + ((bytes[0] ?? 0) % 2)}.${bytes[1] ?? 0}.${(bytes[2] ?? 0) || 1}`;
}

/** Applies Fix 1, Fix 2 and Fix 3 to a page. Safe to call once per page. */
export async function applyPageFixes(page: Page): Promise<void> {
  // Fix 1 — abort Google Fonts requests as a safety net.
  await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
  await page.route('https://fonts.gstatic.com/**', (route) => route.abort());

  // Fix 2 — override page.goto to default to domcontentloaded.
  const originalGoto = page.goto.bind(page);
  page.goto = async (url: string, options?: Parameters<Page['goto']>[1]) => {
    return originalGoto(url, { waitUntil: 'domcontentloaded', ...options });
  };

  // Fix 3 — poll instead of event-based tracking for Keycloak redirects.
  const originalWaitForURL = page.waitForURL.bind(page);
  page.waitForURL = async (
    urlOrPredicate: Parameters<Page['waitForURL']>[0],
    options?: Parameters<Page['waitForURL']>[1]
  ) => {
    const patternStr = urlOrPredicate.toString();
    if (!patternStr.includes('realms') && !patternStr.includes('8080')) {
      return originalWaitForURL(urlOrPredicate, { waitUntil: 'commit', ...options });
    }
    const timeout = options?.timeout ?? 30_000;
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const currentUrl = page.url();
      const matches =
        (typeof urlOrPredicate === 'string' && currentUrl === urlOrPredicate) ||
        (urlOrPredicate instanceof RegExp && urlOrPredicate.test(currentUrl)) ||
        (typeof urlOrPredicate === 'function' && urlOrPredicate(new URL(currentUrl)));
      if (matches) {
        // URL matched — wait for domcontentloaded so the DOM is ready for
        // locator interactions. Best-effort: an instant SSO redirect may not
        // fire it in time; proceeding is correct there.
        await page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => undefined);
        return;
      }
      await page.waitForTimeout(100);
    }
    throw new Error(
      `page.waitForURL: Timeout ${String(timeout)}ms exceeded waiting for URL matching ${patternStr}`
    );
  };
}
