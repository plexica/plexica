// ac-01-lifecycle.spec.ts — Spec 004, AC-01: Plugin Lifecycle.
// Real behavior: admin browses marketplace, installs a plugin, and the
// installation shows up on the installed-plugins page.

import { expect, test } from '../helpers/base-fixture.js';
import { expectResponseTo } from '../helpers/api-response.js';
import { hasKeycloak, loginAsAdmin, requireKeycloakInCI } from '../helpers/admin-login.js';

test.describe.serial('004 Plugin System — AC-01: Plugin Lifecycle', () => {
  test.skip(!hasKeycloak, 'Requires live Keycloak (PLAYWRIGHT_KEYCLOAK_* env vars)');

  test.beforeAll(() => {
    requireKeycloakInCI();
  });

  test('marketplace renders plugin cards with real data (name + author)', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/marketplace');

    const crm = page.getByTestId('plugin-card').filter({ hasText: 'CRM' });
    await expect(crm).toHaveCount(1);
    await expect(crm.getByRole('heading', { name: 'CRM', exact: true })).toBeVisible();
    await expect(crm.getByText('Plexica', { exact: true })).toBeVisible();
  });

  test('installing a plugin from the marketplace makes it appear in the installed list', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await loginAsAdmin(page);
    await page.goto('/marketplace');

    const crm = page.getByTestId('plugin-card').filter({ hasText: 'CRM' });
    await expect(crm).toHaveCount(1);
    const installBtn = crm.getByRole('button', { name: /^install$/i });
    await expect(installBtn).toBeEnabled();
    // Shared convention: exact pathname (endsWith() also matched a duplicated
    // prefix) and an exact status — the previous 200 ≤ status < 300 range would
    // have accepted a 204 that carries no body for the assertion below.
    const installResponse = await expectResponseTo(
      page,
      '/api/v1/plugins/crm/install',
      'POST',
      async () => {
        await installBtn.click();
      }
    );
    expect(await installResponse.json()).toMatchObject({ slug: 'crm', status: 'active' });
    await expect(crm.getByRole('button', { name: /^installed$/i })).toBeVisible({
      timeout: 20_000,
    });

    // Verify the plugin now appears on the installed-plugins page.
    await page.goto('/settings/plugins');
    await expect(page.getByRole('heading', { name: /installed plugins/i })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText('CRM', { exact: true }).first()).toBeVisible({ timeout: 10_000 });
  });
});
