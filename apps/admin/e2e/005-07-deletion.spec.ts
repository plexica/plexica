// 005-07-deletion.spec.ts — Deletion saga E2E (Feature 005-07).
// Provision a throwaway tenant via the admin API → open its detail → Delete
// with type-to-confirm → watch the deletion panel → poll until all 3 steps are
// done → verify the tenant row is `deleted` and the saga steps are all `done`.
// The test is its own cleanup: the provisioned tenant is permanently erased.

import { expect, test } from './helpers/base-fixture.js';
import { loginAsAdmin, hasKeycloak, requireKeycloakInCI } from './helpers/admin-login.js';
import { adminApi } from './helpers/api-client.js';

test.describe('005-07 Tenant deletion saga', () => {
  test.skip(!hasKeycloak, 'Requires live Keycloak');
  test.beforeAll(() => requireKeycloakInCI());

  const slug = `e2e-del-${Date.now()}`;
  const name = `E2E Delete ${Date.now()}`;
  const adminEmail = `admin@${slug}.local`;
  let tenantId = '';

  test.beforeAll(async () => {
    const result = await adminApi().provisionTenant({ slug, name, adminEmail });
    tenantId = result.tenantId;
  });

  test('deleting a tenant erases schema/realm/bucket and marks it deleted', async ({ page }) => {
    const api = adminApi();
    await loginAsAdmin(page);
    await page.goto(`/tenants/${tenantId}`);
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible({
      timeout: 15_000,
    });

    // Open the type-to-confirm delete dialog.
    await page.getByRole('button', { name: `Delete ${name}` }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Type the slug exactly to arm the destructive confirm button.
    await page.getByLabel(/Type the tenant slug/i).fill(slug);
    await dialog.getByRole('button', { name: 'Delete Permanently' }).click();

    // The deletion saga started (202) → the DeletionStatusPanel replaces the
    // action buttons and shows the 3 steps. Wait for the completion notice.
    await expect(page.getByText(/Deletion complete/)).toBeVisible({ timeout: 90_000 });

    // Source-of-truth checks via the admin API.
    const detail = await api.getTenantDetail(tenantId);
    expect(detail.tenant.status).toBe('deleted');

    const status = await api.getDeletionStatus(tenantId);
    expect(status.steps.length).toBe(3);
    expect(status.steps.every((s) => s.status === 'done')).toBe(true);
  });
});
