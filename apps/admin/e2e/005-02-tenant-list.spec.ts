// 005-02-tenant-list.spec.ts — Tenant list E2E (Feature 005-02).
// Super admin → /tenants → tenant table → search by name → filter by status →
// pagination controls present. The global-setup e2e-admin tenant must be visible.

import { expect, test } from './helpers/base-fixture.js';
import { loginAsAdmin, hasKeycloak, requireKeycloakInCI } from './helpers/admin-login.js';

const E2E_TENANT_SLUG = process.env['PLAYWRIGHT_ADMIN_E2E_TENANT_SLUG'] ?? 'e2e-admin';
const E2E_TENANT_NAME = process.env['PLAYWRIGHT_ADMIN_E2E_TENANT_NAME'] ?? 'E2E Admin';

test.describe('005-02 Tenant list', () => {
  test.skip(!hasKeycloak, 'Requires live Keycloak');
  test.beforeAll(() => requireKeycloakInCI());

  test('tenant table renders the e2e-admin tenant', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/tenants');
    await expect(page.getByRole('heading', { level: 1, name: 'Tenants' })).toBeVisible();

    // Deleted tenants from E2E deletion tests may fill the first page.
    // Search for the stable slug to locate the row regardless of pagination.
    const search = page.getByLabel('Search by name or slug');
    await search.fill(E2E_TENANT_SLUG);
    await expect(page.getByText(E2E_TENANT_SLUG, { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(E2E_TENANT_NAME, { exact: true })).toBeVisible();
  });

  test('search by name narrows the table and updates the result count', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/tenants');

    const search = page.getByLabel('Search by name or slug');
    await search.fill(E2E_TENANT_NAME);

    // The e2e-admin row is found by name search; the result-count region updates.
    await expect(page.getByText(E2E_TENANT_SLUG, { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/Showing \d+–\d+ of \d+ tenants/)).toBeVisible();

    // A non-matching term yields the empty state.
    await search.fill('zzz-no-such-tenant-zzz');
    await expect(page.getByText(/No tenants found/)).toBeVisible({ timeout: 15_000 });
  });

  test('filter by status and pagination controls are operable', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/tenants');

    // Filter to Active tenants first so deleted tenants don't obscure the row.
    const statusSelect = page.getByRole('combobox', { name: 'Filter by status' });
    await statusSelect.click();
    await page.getByRole('option', { name: 'Active', exact: true }).click();

    // The e2e-admin tenant is active → it is visible after filtering.
    await expect(page.getByText(E2E_TENANT_SLUG, { exact: true })).toBeVisible({
      timeout: 15_000,
    });

    // Pagination nav is present and Previous is disabled on page 1.
    const pagination = page.getByRole('navigation', { name: 'Pagination' });
    await expect(pagination).toBeVisible();
    await expect(pagination.getByRole('button', { name: 'Previous page' })).toBeDisabled();
  });
});
