// user-profile-a11y.spec.ts
// E2E-08 (accessibility slice): keyboard navigation + axe-core audit for /profile.
// Extracted from user-profile.spec.ts to keep both files under the 200-line
// limit (Constitution Rule 4) after the server round-trip assertions were added.
// Skips when Keycloak credentials are absent or the stack is not running.

import AxeBuilder from '@axe-core/playwright';

import { expect, test } from './helpers/base-fixture.js';
import { hasKeycloak, loginAsAdmin, requireKeycloakInCI } from './helpers/admin-login.js';

test.describe.configure({ mode: 'parallel' });

test.describe('E2E-08: User profile — accessibility', () => {
  test.skip(!hasKeycloak, 'Requires live Keycloak (PLAYWRIGHT_KEYCLOAK_* env vars)');

  test.beforeAll(() => {
    requireKeycloakInCI();
  });

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('/profile page is keyboard-navigable', async ({ page }) => {
    await page.goto('/profile');
    await expect(page.getByRole('heading', { name: /profile/i }).first()).toBeVisible();
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement?.tagName ?? 'BODY');
    expect(focused).not.toBe('BODY');
  });

  test('/profile page passes axe-core accessibility check', async ({ page }) => {
    await page.goto('/profile');
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations).toEqual([]);
  });
});
