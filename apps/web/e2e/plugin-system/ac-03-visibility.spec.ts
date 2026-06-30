// ac-03-visibility.spec.ts — Spec 004, AC-03: Plugin Workspace Visibility.
// Real behavior: open the visibility editor for an installed plugin, toggle a
// workspace off, see the UI reflect the pending change, toggle it back on.

import { expect, test } from '../helpers/base-fixture.js';
import {
  hasKeycloak,
  loginAsAdmin,
  requireKeycloakInCI,
} from '../helpers/admin-login.js';

test.describe('004 Plugin System — AC-03: Plugin Workspace Visibility', () => {
  test.skip(!hasKeycloak, 'Requires live Keycloak (PLAYWRIGHT_KEYCLOAK_* env vars)');

  test.beforeAll(() => {
    requireKeycloakInCI();
  });

  test('toggling a workspace visibility switch updates the UI and reverts', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/settings/plugins');

    await expect(page.getByRole('heading', { name: /installed plugins/i })).toBeVisible({ timeout: 10_000 });

    // Need at least one installed plugin to exercise visibility.
    const visibilityToggle = page.getByRole('button', { name: /visibility/i }).first();
    if (!(await visibilityToggle.isVisible().catch(() => false))) {
      test.skip(true, 'No installed plugins available to test visibility');
      return;
    }

    await visibilityToggle.click();

    // The visibility editor renders one toggle per workspace.
    const switches = page.getByRole('switch');
    await expect(switches.first()).toBeVisible({ timeout: 10_000 });
    const firstSwitch = switches.first();
    const initial = await firstSwitch.getAttribute('aria-checked').catch(() => null);
    const wasChecked = initial === 'true';

    // Toggle off (or on, if already off) — a real state change.
    await firstSwitch.click();
    await expect(firstSwitch).toHaveAttribute(
      'aria-checked',
      wasChecked ? 'false' : 'true',
    );

    // Toggle back to the original state.
    await firstSwitch.click();
    await expect(firstSwitch).toHaveAttribute('aria-checked', wasChecked ? 'true' : 'false');
  });
});
