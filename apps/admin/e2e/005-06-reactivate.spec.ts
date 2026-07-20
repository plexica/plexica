// 005-06-reactivate.spec.ts — Reactivation E2E (Feature 005-06).
// Super admin suspends the e2e-admin tenant first → opens Reactivate → confirm
// → status becomes active (UI badge + admin API). afterAll guarantees the
// tenant is active again for downstream suites.

import { expect, test } from './helpers/base-fixture.js';
import { loginAsAdmin, hasKeycloak, requireKeycloakInCI } from './helpers/admin-login.js';
import { adminApi } from './helpers/api-client.js';

const E2E_TENANT_SLUG = process.env['PLAYWRIGHT_ADMIN_E2E_TENANT_SLUG'] ?? 'e2e-admin';
const E2E_TENANT_NAME = process.env['PLAYWRIGHT_ADMIN_E2E_TENANT_NAME'] ?? 'E2E Admin';

test.describe('005-06 Tenant reactivation', () => {
  test.skip(!hasKeycloak, 'Requires live Keycloak');
  test.beforeAll(() => requireKeycloakInCI());

  let tenantId = '';

  test.beforeAll(async () => {
    const api = adminApi();
    const tenant = await api.findTenantBySlug(E2E_TENANT_SLUG);
    if (tenant === undefined) {
      throw new Error(`E2E tenant '${E2E_TENANT_SLUG}' not found — run global-setup`);
    }
    tenantId = tenant.id;
    // The test suspends first; ensure a clean active baseline.
    await api.ensureActive(tenantId);
  });

  test.afterAll(async () => {
    if (tenantId !== '') await adminApi().ensureActive(tenantId);
  });

  test('reactivating a suspended tenant changes its status back to active', async ({ page }) => {
    await loginAsAdmin(page);

    // Suspend via the admin API first so the Reactivate action is enabled.
    const api = adminApi();
    const before = await api.getTenantDetail(tenantId);
    await api.suspendTenant(tenantId, before.tenant.version);

    await page.goto(`/tenants/${tenantId}`);
    await expect(page.getByRole('heading', { level: 1, name: E2E_TENANT_NAME })).toBeVisible({
      timeout: 15_000,
    });
    // Confirm the page reflects the suspended state before reactivating.
    await expect(page.getByText('Suspended', { exact: true }).first()).toBeVisible({
      timeout: 15_000,
    });

    // Open the reactivate confirmation dialog and confirm.
    await page.getByRole('button', { name: `Reactivate ${E2E_TENANT_NAME}` }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Reactivate', exact: true }).click();
    await expect(dialog).not.toBeVisible({ timeout: 15_000 });

    // Status badge flips back to Active.
    await expect(page.getByText('Active', { exact: true }).first()).toBeVisible({
      timeout: 15_000,
    });

    const after = await api.getTenantDetail(tenantId);
    expect(after.tenant.status).toBe('active');
  });
});
