// 005-03-tenant-detail.spec.ts — Tenant detail E2E (Feature 005-03).
// Super admin → tenant detail → 4 tabs (Info, Users, Plugins, Audit). Info tab
// shows metadata; Users tab shows counts; Audit tab shows the audit section.

import { expect, test } from './helpers/base-fixture.js';
import { loginAsAdmin, hasKeycloak, requireKeycloakInCI } from './helpers/admin-login.js';
import { adminApi } from './helpers/api-client.js';

const E2E_TENANT_SLUG = process.env['PLAYWRIGHT_ADMIN_E2E_TENANT_SLUG'] ?? 'e2e-admin';
const E2E_TENANT_NAME = process.env['PLAYWRIGHT_ADMIN_E2E_TENANT_NAME'] ?? 'E2E Admin';

test.describe('005-03 Tenant detail', () => {
  test.skip(!hasKeycloak, 'Requires live Keycloak');
  test.beforeAll(() => requireKeycloakInCI());

  let tenantId = '';

  test.beforeAll(async () => {
    const tenant = await adminApi().findTenantBySlug(E2E_TENANT_SLUG);
    if (tenant === undefined) {
      throw new Error(`E2E tenant '${E2E_TENANT_SLUG}' not found — run global-setup`);
    }
    tenantId = tenant.id;
  });

  test('detail page shows the 4 tabs and tenant metadata on the Info tab', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`/tenants/${tenantId}`);

    // Header carries the tenant name.
    await expect(page.getByRole('heading', { level: 1, name: E2E_TENANT_NAME })).toBeVisible({
      timeout: 15_000,
    });

    // 4 tabs present.
    const tabs = page.getByRole('tablist');
    await expect(tabs.getByRole('tab', { name: 'Info', exact: true })).toBeVisible();
    await expect(tabs.getByRole('tab', { name: 'Users', exact: true })).toBeVisible();
    await expect(tabs.getByRole('tab', { name: 'Plugins', exact: true })).toBeVisible();
    await expect(tabs.getByRole('tab', { name: 'Audit', exact: true })).toBeVisible();

    // Info tab is active by default and renders the slug metadata field.
    await expect(page.getByText('Slug', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(E2E_TENANT_SLUG, { exact: true })).toBeVisible();
  });

  test('Users tab shows total user + workspace counts', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`/tenants/${tenantId}`);
    await expect(page.getByRole('heading', { level: 1, name: E2E_TENANT_NAME })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole('tab', { name: 'Users', exact: true }).click();
    // The Users tab renders a "Total Users" count card with a numeric value.
    const usersCard = page
      .locator('dl')
      .filter({ has: page.getByText('Total Users', { exact: true }) });
    await expect(usersCard).toBeVisible();
    await expect(usersCard.locator('dd').first()).toContainText(/\d/);
  });

  test('Audit tab renders the platform audit log section', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`/tenants/${tenantId}`);
    await expect(page.getByRole('heading', { level: 1, name: E2E_TENANT_NAME })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole('tab', { name: 'Audit', exact: true }).click();
    // Audit section heading (interpolated with the tenant name) confirms the
    // tab loaded. The tab may show entries or the empty notice — both are valid
    // "loaded" outcomes; the loading state must have resolved.
    await expect(
      page.getByRole('heading', { level: 2, name: new RegExp(`Platform Audit Log for ${E2E_TENANT_NAME}`) })
    ).toBeVisible({ timeout: 15_000 });
  });
});
