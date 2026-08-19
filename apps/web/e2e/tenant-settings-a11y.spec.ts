// tenant-settings-a11y.spec.ts
// E2E-07 (accessibility slice): axe-core audit for /settings.
// Extracted from tenant-settings.spec.ts to keep both files under the 200-line
// limit (Constitution Rule 4) after the server round-trip assertions were added.
// Skips when Keycloak credentials are absent or the stack is not running.

import AxeBuilder from '@axe-core/playwright';

import { expect, test } from './helpers/base-fixture.js';
import { hasKeycloak, loginAsAdmin, requireKeycloakInCI } from './helpers/admin-login.js';

test.describe.configure({ mode: 'parallel' });

test.describe('E2E-07: Tenant settings — accessibility', () => {
  test.skip(!hasKeycloak, 'Requires live Keycloak (PLAYWRIGHT_KEYCLOAK_* env vars)');

  test.beforeAll(() => {
    requireKeycloakInCI();
  });

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('settings page passes axe-core accessibility check', async ({ page }) => {
    await page.goto('/settings');
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations).toEqual([]);
  });
});
