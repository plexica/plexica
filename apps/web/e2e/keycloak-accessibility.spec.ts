// keycloak-accessibility.spec.ts
// E2E tests: Plexica Keycloak custom theme — accessibility (WCAG 2.4.7 focus management).
//
// Extracted from keycloak-login.spec.ts to satisfy Constitution Rule 4 (no file above 200 lines).
//
// Requires the full stack: docker compose up (Keycloak with plexica-theme.jar).
// Skips when PLAYWRIGHT_KEYCLOAK_URL is not provided.
//
// Spec: ADR-010 (Keycloakify theme), Constitution Rule 1 (every feature has E2E).

import { expect, test } from './helpers/base-fixture.js';

const KEYCLOAK_URL = process.env['PLAYWRIGHT_KEYCLOAK_URL'] ?? '';
const KEYCLOAK_USERNAME = process.env['PLAYWRIGHT_KEYCLOAK_USER'] ?? '';
const TENANT_SLUG = process.env['PLAYWRIGHT_TENANT_SLUG'] ?? 'test-tenant';

const hasKeycloak = KEYCLOAK_URL.length > 0 && KEYCLOAK_USERNAME.length > 0;

// ---------------------------------------------------------------------------
// Accessibility — focus management (WCAG 2.4.7)
// ---------------------------------------------------------------------------

test.describe('Keycloak theme — Accessibility', () => {
  test.skip(
    !hasKeycloak,
    'Requires PLAYWRIGHT_KEYCLOAK_URL, PLAYWRIGHT_KEYCLOAK_USER, PLAYWRIGHT_KEYCLOAK_PASS'
  );

  test('submit button is reachable by keyboard and receives focus', async ({ page }) => {
    await page.goto('/?tenant=' + TENANT_SLUG);
    await page.waitForURL(/\/realms\//);

    // Wait for the React SPA to mount and autoFocus to fire on the username input.
    // Once this is visible, document.activeElement is already on #username.
    await page.locator('#username').waitFor({ state: 'visible' });

    // Tab order from #username (autoFocused):
    //   Tab 1 → "Forgot password" link (label-row, before password input in DOM)
    //   Tab 2 → password input
    //   Tab 3 → toggle button (.input-toggle)
    //   Tab 4 → submit button (.btn.btn-primary)
    await page.keyboard.press('Tab'); // forgot-password link
    await page.keyboard.press('Tab'); // password input
    await page.keyboard.press('Tab'); // toggle button
    await page.keyboard.press('Tab'); // submit button

    const focused = await page.evaluate(() => document.activeElement?.className ?? '');
    expect(focused).toContain('btn-primary');
  });

  test('toggle password button is focusable via keyboard', async ({ page }) => {
    await page.goto('/?tenant=' + TENANT_SLUG);
    await page.waitForURL(/\/realms\//);

    // Wait for the React SPA to mount and autoFocus to fire on the username input.
    await page.locator('#username').waitFor({ state: 'visible' });

    // Tab order from #username (autoFocused):
    //   Tab 1 → "Forgot password" link
    //   Tab 2 → password input
    //   Tab 3 → toggle button (.input-toggle)
    await page.keyboard.press('Tab'); // forgot-password link
    await page.keyboard.press('Tab'); // password input
    await page.keyboard.press('Tab'); // toggle button

    const focused = await page.evaluate(() => document.activeElement?.className ?? '');
    expect(focused).toContain('input-toggle');
  });

  test('no Google Fonts external requests on login page', async ({ page }) => {
    const externalFontRequests: string[] = [];
    page.on('request', (req) => {
      const url = req.url();
      let hostname = '';
      try {
        hostname = new URL(url).hostname;
      } catch {
        // malformed URL — skip
      }
      if (hostname === 'fonts.googleapis.com' || hostname === 'fonts.gstatic.com') {
        externalFontRequests.push(url);
      }
    });

    await page.goto('/?tenant=' + TENANT_SLUG);
    await page.waitForURL(/\/realms\//);
    await page.waitForLoadState('networkidle');

    expect(
      externalFontRequests,
      'GDPR: no external Google Fonts requests on login page'
    ).toHaveLength(0);
  });
});
