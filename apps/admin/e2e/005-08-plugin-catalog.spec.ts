// 005-08-plugin-catalog.spec.ts — Plugin catalog E2E (Feature 005-08).
// Super admin → /plugins → plugin table → filter by review status → review a
// pending plugin (approve). Asserts the review status changes after the action.
//
// NOTE: this spec surfaces two pre-existing integration gaps that must be
// resolved for it to pass against a live stack:
//   1. services/admin-api.ts listPlugins() types the response as Plugin[] but
//      the backend returns a paged { data, total, page, pageSize } object — the
//      PluginsPage calls .filter() on the object and crashes during render.
//   2. There is no flow that sets a plugin's reviewStatus to 'pending', so the
//      review action has no deterministic seed data. The review test skips when
//      no pending plugin is available via the API.

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
    const pending = list.data.find((p) => p.reviewStatus === 'pending');
    if (pending === undefined) {
      // No deterministic pending plugin available — see file header note #2.
      test.skip(true, 'No plugin with reviewStatus=pending available to review');
      return;
    }

    await loginAsAdmin(page);
    await page.goto('/plugins');
    await expect(page.getByRole('table')).toBeVisible({ timeout: 15_000 });

    // Open the review dialog for the pending plugin row.
    await page.getByRole('button', { name: pending.name }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(dialog).not.toBeVisible({ timeout: 15_000 });

    // The row's review badge now reads "Approved".
    const row = page.getByRole('row').filter({ hasText: pending.name });
    await expect(row.getByText('Approved', { exact: true })).toBeVisible({ timeout: 15_000 });

    // Source-of-truth check via the API.
    const after = await api.listPlugins();
    const updated = after.data.find((p) => p.slug === pending.slug) as PluginRow | undefined;
    expect(updated?.reviewStatus).toBe('approved');
  });
});
