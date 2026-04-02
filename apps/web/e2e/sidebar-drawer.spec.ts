// sidebar-drawer.spec.ts
// E2E test: mobile sidebar drawer — focus management, keyboard navigation,
// close behaviour, and axe-core accessibility (WCAG 2.1 §2.1.2, §2.4.3, §4.1.2).
//
// All tests run in a 375×812 mobile viewport so the lg:hidden desktop sidebar
// is never shown and the drawer toggle is the only sidebar control visible.
// Desktop app-shell accessibility is covered in shell-a11y.spec.ts.

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import {
  hasKeycloak,
  KEYCLOAK_PASSWORD,
  KEYCLOAK_USERNAME,
  loginViaKeycloak,
  requireKeycloakInCI,
  TENANT_SLUG,
} from './helpers/keycloak-login.js';

// Force mobile viewport for the entire suite.
test.use({ viewport: { width: 375, height: 812 } });

test.describe('Mobile sidebar drawer', () => {
  test.skip(
    !hasKeycloak,
    'Requires PLAYWRIGHT_KEYCLOAK_URL, PLAYWRIGHT_KEYCLOAK_USER, PLAYWRIGHT_KEYCLOAK_PASS'
  );

  // P10-M-2: fail loudly in CI when credentials are absent rather than silently passing
  // with 0 tests — a green result with 0 tests run is not a valid CI signal
  // (Constitution Rules 1 and 2).
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

  test('opening drawer moves focus to the close button [002-20, WCAG 2.4.3]', async ({ page }) => {
    // Click the hamburger — on mobile viewport aria-controls points to "sidebar-drawer"
    await page.getByRole('button', { name: 'Toggle sidebar' }).click();

    const drawer = page.locator('#sidebar-drawer');
    await expect(drawer).toBeVisible();

    // First focusable element in the drawer is the close button (P8-I-2)
    await expect(drawer.getByRole('button', { name: 'Close navigation' })).toBeFocused();
  });

  test('Tab wraps from last item to close button; Shift+Tab wraps close to last [002-20, WCAG 2.1.2]', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Toggle sidebar' }).click();
    const drawer = page.locator('#sidebar-drawer');
    await expect(drawer).toBeVisible();

    const closeBtn = drawer.getByRole('button', { name: 'Close navigation' });
    const dashboardLink = drawer.getByRole('link', { name: 'Dashboard' });

    // Tab: close button → Dashboard link (only nav item)
    await page.keyboard.press('Tab');
    await expect(dashboardLink).toBeFocused();

    // Tab again from last item → wraps to close button
    await page.keyboard.press('Tab');
    await expect(closeBtn).toBeFocused();

    // Shift+Tab from close button → wraps back to Dashboard link
    await page.keyboard.press('Shift+Tab');
    await expect(dashboardLink).toBeFocused();
  });

  test('Escape closes drawer and returns focus to the hamburger button [002-20, WCAG 2.4.3]', async ({
    page,
  }) => {
    const toggleBtn = page.getByRole('button', { name: 'Toggle sidebar' });
    await toggleBtn.click();
    await expect(page.locator('#sidebar-drawer')).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(page.locator('#sidebar-drawer')).not.toBeVisible();
    // WCAG 2.4.3: focus must return to the element that opened the dialog
    await expect(toggleBtn).toBeFocused();
  });

  test('close button click closes drawer and returns focus to hamburger [002-20, WCAG 2.4.3]', async ({
    page,
  }) => {
    const toggleBtn = page.getByRole('button', { name: 'Toggle sidebar' });
    await toggleBtn.click();
    const drawer = page.locator('#sidebar-drawer');
    await expect(drawer).toBeVisible();

    await drawer.getByRole('button', { name: 'Close navigation' }).click();

    await expect(drawer).not.toBeVisible();
    // WCAG 2.4.3: focus must return to the element that opened the dialog
    await expect(toggleBtn).toBeFocused();
  });

  // P10-M-4: covers the third close path — backdrop click
  test('backdrop click closes drawer and returns focus to hamburger [002-20, WCAG 2.4.3]', async ({
    page,
  }) => {
    const toggleBtn = page.getByRole('button', { name: 'Toggle sidebar' });
    await toggleBtn.click();
    await expect(page.locator('#sidebar-drawer')).toBeVisible();

    // Drawer is w-60 (240px Tailwind) on a 375px viewport; x=320 is 80px into
    // the backdrop. Playwright mouse coordinates are CSS logical pixels — device
    // pixel ratio does not affect hit-testing geometry. No scrollbar risk at
    // 812px viewport height (drawer content is < 100px: 64px header + one nav item).
    await page.mouse.click(320, 400);

    await expect(page.locator('#sidebar-drawer')).not.toBeVisible();
    // WCAG 2.4.3: focus must return to the element that opened the dialog
    await expect(toggleBtn).toBeFocused();
  });

  test('Tab cannot escape drawer to background content while open [002-20, WCAG 2.1.2]', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Toggle sidebar' }).click();
    await expect(page.locator('#sidebar-drawer')).toBeVisible();

    // Tab 10 times — focus must stay inside #sidebar-drawer on every press
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab');
      const isInsideDrawer = await page.evaluate(() => {
        const drawerEl = document.getElementById('sidebar-drawer');
        return drawerEl?.contains(document.activeElement) ?? false;
      });
      expect(isInsideDrawer, `Tab press ${i + 1}: focus escaped the drawer`).toBe(true);
    }
  });

  test('open drawer passes axe-core WCAG 2.1 AA accessibility check [NFR-08]', async ({ page }) => {
    await page.getByRole('button', { name: 'Toggle sidebar' }).click();
    await expect(page.locator('#sidebar-drawer')).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });
});
