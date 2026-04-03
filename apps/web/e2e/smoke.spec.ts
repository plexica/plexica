// smoke.spec.ts — E2E smoke test: app entry points render correctly.
// Constitution Rule 1: every user-interactive surface must have an E2E test.
//
// NOTE: LoginPage (login-page.tsx) is a Phase 0 placeholder that is NOT wired
// into the router. The app entry point at `/` redirects to /org-error when no
// tenant is present. Full Keycloak login-page coverage lives in login-flow.spec.ts.

import AxeBuilder from '@axe-core/playwright';

import { expect, test } from './helpers/base-fixture.js';

test.describe('App smoke test', () => {
  test('app loads at / without tenant and shows org-error page', async ({ page }) => {
    await page.goto('/');

    // Root loader must redirect to /org-error (no tenant in URL or sessionStorage)
    await page.waitForURL(/\/org-error/, { timeout: 10_000 });

    // Page must load with correct title — proves the React app mounted
    await expect(page).toHaveTitle(/Plexica/i);

    // org-error heading must be visible
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('org-error page passes axe-core accessibility check (no critical violations)', async ({
    page,
  }) => {
    await page.goto('/org-error?reason=no-subdomain');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test('org-error headings are programmatically correct (role + level)', async ({ page }) => {
    await page.goto('/org-error?reason=no-subdomain');

    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toBeVisible();
    // Heading must contain meaningful text — not empty or whitespace-only
    const text = (await h1.textContent()) ?? '';
    expect(text.trim().length).toBeGreaterThan(0);
  });

  test('org-error page is keyboard-navigable (Tab reaches at least one focusable element)', async ({
    page,
  }) => {
    await page.goto('/org-error?reason=no-subdomain');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // Tab from body — at least one focusable element must exist (e.g. a link)
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement?.tagName ?? 'BODY');
    // If only BODY is focused there are zero interactive elements — that is a failure
    expect(focused).not.toBe('BODY');
  });
});
