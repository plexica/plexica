// 005-05-suspend.spec.ts — Suspension E2E (Feature 005-05).
// Super admin → e2e-admin detail → Suspend → confirm → status becomes
// suspended (UI badge + admin API). afterAll reactivates the tenant so
// downstream suites find it active.

import { expect, test } from './helpers/base-fixture.js';
import { loginAsAdmin, hasKeycloak, requireKeycloakInCI } from './helpers/admin-login.js';
import { adminApi } from './helpers/api-client.js';

const E2E_TENANT_SLUG = process.env['PLAYWRIGHT_ADMIN_E2E_TENANT_SLUG'] ?? 'e2e-admin';
const E2E_TENANT_NAME = process.env['PLAYWRIGHT_ADMIN_E2E_TENANT_NAME'] ?? 'E2E Admin';

test.describe('005-05 Tenant suspension', () => {
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
    // Guarantee a clean active state before the suite runs.
    await api.ensureActive(tenantId);
  });

  test.afterAll(async () => {
    if (tenantId !== '') await adminApi().ensureActive(tenantId);
  });

  test('suspending the tenant changes its status to suspended', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`/tenants/${tenantId}`);
    await expect(page.getByRole('heading', { level: 1, name: E2E_TENANT_NAME })).toBeVisible({
      timeout: 15_000,
    });

    // Open the suspend confirmation dialog.
    await page.getByRole('button', { name: `Suspend ${E2E_TENANT_NAME}` }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Confirm — the dialog closes and the tenant detail refetches.
    await dialog.getByRole('button', { name: 'Suspend', exact: true }).click();
    await expect(dialog).not.toBeVisible({ timeout: 15_000 });

    // The status badge in the header now reads "Suspended".
    await expect(page.getByText('Suspended', { exact: true }).first()).toBeVisible({
      timeout: 15_000,
    });

    // Assert via the admin API — the source of truth for the tenant row.
    const detail = await adminApi().getTenantDetail(tenantId);
    expect(detail.tenant.status).toBe('suspended');
  });
});
