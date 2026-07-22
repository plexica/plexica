// 005-08-plugin-catalog.spec.ts — Plugin catalog E2E (Feature 005-08).
// Super admin → /plugins → plugin table → filter by review status → review a
// pending plugin (approve). Asserts the review status changes after the action.
//
// Prerequisites (resolved in admin E2E global-setup):
//   - Plugin catalog is seeded with at least one plugin that has
//     reviewStatus='pending' (seed-plugins.ts sets the first seed plugin
//     to 'pending' to provide deterministic E2E data).

import { expect, test } from './helpers/base-fixture.js';
import { loginAsAdmin, hasKeycloak, requireKeycloakInCI } from './helpers/admin-login.js';
import { adminApi, type PluginRow } from './helpers/api-client.js';

test.describe('005-08 Plugin catalog', () => {
  test.skip(!hasKeycloak, 'Requires live Keycloak');
  test.beforeAll(() => requireKeycloakInCI());

  test('plugin table renders catalog rows', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/plugins');
    await expect(page.getByRole('heading', { level: 1, name: 'Plugins' })).toBeVisible();

    // The catalog always contains the seeded CRM plugin — its row is the
    // "data loaded" signal. The first <th> column is the plugin name.
    await expect(page.getByRole('table')).toBeVisible({ timeout: 15_000 });
    const rows = page.getByRole('row');
    // Header row + at least one data row.
    expect(await rows.count()).toBeGreaterThan(1);
  });

  test('filter by review status narrows the catalog', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/plugins');
    await expect(page.getByRole('table')).toBeVisible({ timeout: 15_000 });

    const filter = page.getByRole('combobox', { name: 'Filter by review status' });
    await filter.click();
    await page.getByRole('option', { name: 'Approved', exact: true }).click();

    // Result-count line updates to reflect the filtered set.
    await expect(page.getByText(/^(No plugins|\d+ plugins?)$/)).toBeVisible();
  });

  test('approving a pending plugin changes its review status', async ({ page }) => {
    const api = adminApi();
    const list = await api.listPlugins();
    const pending = list.data.find((p) => p.reviewStatus === 'pending') as PluginRow | undefined;
    // Global-setup seeds the first plugin with reviewStatus='pending', so a
    // missing pending plugin means seed-plugins failed silently. Fail hard
    // rather than skip — a green CI must mean the test actually ran.
    expect(pending, 'No pending plugin — seed-plugins may have failed').toBeDefined();
    // At this point pending is guaranteed by the assertion above. TypeScript
    // doesn't narrow via expect(), so the non-null assertion is needed.
    const plugin = pending!;

    await loginAsAdmin(page);
    await page.goto('/plugins');
    await expect(page.getByRole('table')).toBeVisible({ timeout: 15_000 });

    // Open the review dialog for the pending plugin row.
    await page.getByRole('button', { name: plugin.name }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(dialog).not.toBeVisible({ timeout: 15_000 });

    // The row's review badge now reads "Approved".
    const row = page.getByRole('row').filter({ hasText: plugin.name });
    await expect(row.getByText('Approved', { exact: true })).toBeVisible({ timeout: 15_000 });

    // Source-of-truth check via the API.
    const after = await api.listPlugins();
    const updated = after.data.find((p) => p.slug === plugin.slug) as PluginRow | undefined;
    expect(updated?.reviewStatus).toBe('approved');
  });
});
