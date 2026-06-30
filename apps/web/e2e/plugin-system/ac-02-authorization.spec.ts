// ac-02-authorization.spec.ts — Spec 004, AC-02: Plugin Action Authorization.
// Real behavior: a viewer (no plugin:manage permission) can browse the
// marketplace but cannot install — the install control is disabled.

import { expect, test } from '../helpers/base-fixture.js';
import {
  hasKeycloak,
  loginAsViewer,
  requireKeycloakInCI,
} from '../helpers/admin-login.js';

test.describe('004 Plugin System — AC-02: Plugin Action Authorization', () => {
  test.skip(!hasKeycloak, 'Requires live Keycloak (PLAYWRIGHT_KEYCLOAK_* env vars)');

  test.beforeAll(() => {
    requireKeycloakInCI();
  });

  test('viewer can open the marketplace', async ({ page }) => {
    await loginAsViewer(page);
    await page.goto('/marketplace');

    await expect(page.getByRole('heading', { name: /marketplace/i })).toBeVisible({ timeout: 10_000 });
    // Viewer can still browse the catalog.
    const search = page.getByPlaceholder(/Search plugins/i);
    await expect(search).toBeVisible({ timeout: 10_000 });
  });

  test('viewer cannot install — install control is disabled or absent (ABAC plugin:manage)', async ({ page }) => {
    await loginAsViewer(page);
    await page.goto('/marketplace');

    const cards = page.getByTestId('plugin-card');
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });
    const first = cards.first();

    const installBtn = first.getByRole('button', { name: /^install$/i });
    // The install button must either be disabled (ABAC hint) or not rendered.
    const visible = await installBtn.isVisible().catch(() => false);
    if (visible) {
      await expect(installBtn).toBeDisabled();
    }
    // No "Installed" state button can be clickable-install for a viewer either.
    const anyInstall = first.getByRole('button', { name: /^install$/i });
    const anyVisible = await anyInstall.isVisible().catch(() => false);
    expect(anyVisible === false || (await installBtn.isDisabled().catch(() => true))).toBe(true);
  });
});
