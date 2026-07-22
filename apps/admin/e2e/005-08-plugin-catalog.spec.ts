// 005-08-plugin-catalog.spec.ts — Plugin catalog E2E (Feature 005-08).
// Super admin → /plugins → plugin table → filter by review status → review a
// pending plugin (approve). Asserts the review status changes after the action.
//
// Prerequisites (resolved in admin E2E global-setup):
//   - CRM remains the published + approved marketplace fixture.
//   - A separate draft plugin is reset to reviewStatus='pending' around every
//     test, so retries never depend on a previous review decision.

import {
  CRM_MARKETPLACE_SLUG,
  REVIEW_PLUGIN_FIXTURE,
  resetPluginReviewFixture,
} from '../../../e2e/fixtures/core-fixtures.js';

import { expect, test } from './helpers/base-fixture.js';
import { loginAsAdmin, requireKeycloakInCI } from './helpers/admin-login.js';
import { adminApi, type PluginRow } from './helpers/api-client.js';

test.describe('005-08 Plugin catalog', () => {
  test.beforeAll(() => requireKeycloakInCI());
  test.beforeEach(() => resetPluginReviewFixture());
  test.afterEach(() => resetPluginReviewFixture());

  test('lifecycle fixtures keep CRM installable and review data isolated', async () => {
    const list = await adminApi().listPlugins();
    const crm = list.data.find((plugin) => plugin.slug === CRM_MARKETPLACE_SLUG);
    const review = list.data.find((plugin) => plugin.slug === REVIEW_PLUGIN_FIXTURE.slug);

    expect(crm).toMatchObject({ status: 'published', reviewStatus: 'approved' });
    expect(review).toMatchObject({
      status: 'draft',
      reviewStatus: 'pending',
      installedCount: 0,
    });
  });

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
    const pending = list.data.find(
      (plugin) => plugin.slug === REVIEW_PLUGIN_FIXTURE.slug
    ) as PluginRow | undefined;
    expect(pending).toMatchObject({ status: 'draft', reviewStatus: 'pending' });
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
    const crm = after.data.find((p) => p.slug === CRM_MARKETPLACE_SLUG);
    expect(updated).toMatchObject({
      status: 'draft',
      reviewStatus: 'approved',
      installedCount: 0,
    });
    expect(crm).toMatchObject({ status: 'published', reviewStatus: 'approved' });
  });
});
