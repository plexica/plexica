// shell-a11y.spec.ts
// E2E test: accessibility checks for the app shell (desktop viewport).
// Runs axe-core, verifies keyboard navigation, skip link, and aria-current.
// Mobile drawer accessibility is covered in sidebar-drawer.spec.ts.

import AxeBuilder from '@axe-core/playwright';

import { expect, test } from './helpers/base-fixture.js';
import {
  hasKeycloak,
  KEYCLOAK_PASSWORD,
  KEYCLOAK_USERNAME,
  loginViaKeycloak,
  requireKeycloakInCI,
  TENANT_SLUG,
} from './helpers/keycloak-login.js';

test.describe('App shell accessibility', () => {
  test.skip(!hasKeycloak, 'Requires live Keycloak');

  // P10-M-2: fail loudly in CI when credentials are absent rather than silently passing
  // with 0 tests (Constitution Rules 1 and 2).
  test.beforeAll(() => {
    requireKeycloakInCI();
  });

  test.beforeEach(async ({ page }) => {
    await loginViaKeycloak(page, {
      tenantSlug: TENANT_SLUG,
      username: KEYCLOAK_USERNAME,
      password: KEYCLOAK_PASSWORD,
    });
  });

  test('passes axe-core accessibility check (WCAG 2.1 AA) [NFR-08]', async ({ page }) => {
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test('skip-to-content link appears on first Tab press [002-20]', async ({ page }) => {
    await page.keyboard.press('Tab');
    const skipLink = page.locator('a[href="#main-content"]');
    await expect(skipLink).toBeFocused();
    await expect(skipLink).toBeVisible();
  });

  test('active nav item has aria-current="page" [002-20]', async ({ page }) => {
    // Two [aria-current="page"] links exist: one in the hidden mobile drawer and one
    // in the visible desktop sidebar (aside[aria-label="Sidebar"]). Use the desktop
    // landmark to target the visible instance.
    const activeLink = page
      .getByRole('complementary', { name: /sidebar/i })
      .locator('[aria-current="page"]');
    await expect(activeLink).toBeVisible();
    await expect(activeLink).toHaveAttribute('aria-current', 'page');
  });

  test('Tab key cycles through interactive elements without trap [002-20]', async ({ page }) => {
    // Tab through 10 elements and verify we don't get stuck
    const focusedElements: string[] = [];
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => {
        const el = document.activeElement;
        return el
          ? el.tagName + (el.getAttribute('href') ?? el.getAttribute('type') ?? '')
          : 'none';
      });
      focusedElements.push(focused);
    }
    // Verify we got different elements (not stuck in a loop of 1)
    const uniqueElements = new Set(focusedElements);
    expect(uniqueElements.size).toBeGreaterThan(1);
  });
});
