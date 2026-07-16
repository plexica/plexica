// 005-04-provisioning.spec.ts — Provisioning wizard E2E (Feature 005-04).
// Super admin → /provision → fill 3-step wizard → review → provision → success
// with a temporary password. The provisioned tenant is deleted via the admin
// API in afterAll so the suite is idempotent across runs.

import { expect, test } from './helpers/base-fixture.js';
import { loginAsAdmin, hasKeycloak, requireKeycloakInCI } from './helpers/admin-login.js';
import { adminApi } from './helpers/api-client.js';

test.describe('005-04 Provisioning wizard', () => {
  test.skip(!hasKeycloak, 'Requires live Keycloak');
  test.beforeAll(() => requireKeycloakInCI());

  const slug = `e2e-prov-${Date.now()}`;
  const name = `E2E Provisioned ${Date.now()}`;
  const adminEmail = `admin@${slug}.local`;
  let provisionedSlug = '';

  test.afterAll(async () => {
    if (provisionedSlug === '') return;
    const api = adminApi();
    const tenant = await api.findTenantBySlug(provisionedSlug);
    if (tenant === undefined) return;
    // Start the deletion saga (202) to clean up schema/realm/bucket. If the
    // tenant was never fully provisioned, the delete is a safe no-op error.
    try {
      await api.deleteTenant(tenant.id, tenant.slug, tenant.version);
    } catch {
      // Best-effort cleanup — swallow so afterAll never fails the suite.
    }
  });

  test('provisioning a new tenant shows a success panel with a temp password', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/provision');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Provision New Tenant' })
    ).toBeVisible();

    // Step 1 — fill the details form (fields targeted by localized labels).
    await page.getByLabel('Tenant Slug').fill(slug);
    await page.getByLabel('Tenant Name').fill(name);
    await page.getByLabel('Admin Email').fill(adminEmail);
    await page.getByRole('button', { name: 'Review', exact: true }).click();

    // Step 2 — review summary shows the derived schema/realm/bucket names.
    await expect(page.getByRole('heading', { level: 2, name: 'Review before provisioning' })).toBeVisible();
    // Drop exact:true — the value is followed by a hint in parentheses
    // (e.g. "tenant_xxx(new PostgreSQL schema)") rendered by SummaryRow.
    await expect(page.getByText(`tenant_${slug}`)).toBeVisible();
    await expect(page.getByText(`plexica-${slug}`)).toBeVisible();
    await page.getByRole('button', { name: 'Provision', exact: true }).click();

    // Step 3 — success: heading + a temporary password rendered in <code>.
    await expect(
      page.getByRole('heading', { level: 2, name: 'Tenant provisioned successfully' })
    ).toBeVisible({ timeout: 60_000 });
    const tempPassword = page.locator('code').first();
    await expect(tempPassword).toBeVisible();
    const passwordText = (await tempPassword.textContent()) ?? '';
    expect(passwordText.trim().length).toBeGreaterThan(0);

    provisionedSlug = slug;
  });
});
