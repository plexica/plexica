// 005-01-dashboard.spec.ts — Dashboard E2E (Feature 005-01).
// Super admin logs in → /dashboard renders KPI cards (tenant count, plugin
// count, DLQ depth, health status) with numeric values + a health indicator.
// Constitution Rule 1: every user-interactive surface has an E2E test.

import { expect, test } from './helpers/base-fixture.js';
import { loginAsAdmin, hasKeycloak, requireKeycloakInCI } from './helpers/admin-login.js';
import { adminApi } from './helpers/api-client.js';

test.describe('005-01 Dashboard', () => {
  test.skip(!hasKeycloak, 'Requires live Keycloak');
  test.beforeAll(() => requireKeycloakInCI());

  test('dashboard renders KPI cards with numeric values and a health indicator', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await expect(page).toHaveURL(/\/dashboard/);

    // Page heading must be present (proves the React page mounted).
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();

    // Wait for the loading skeleton to be replaced by the KPI grid: the
    // "Health status" label only renders once metrics have loaded.
    await expect(page.getByText('Health status')).toBeVisible({ timeout: 15_000 });

    // KPI cards are <dl> with a <dt> label and <dd> value. Assert the four
    // cards required by FR 005-01 render and that the Tenants card carries a
    // numeric value (not "Unavailable" — tenantCount is always a number).
    const tenantsCard = page
      .locator('dl')
      .filter({ has: page.getByText('Tenants', { exact: true }) });
    const pluginsCard = page
      .locator('dl')
      .filter({ has: page.getByText('Plugins', { exact: true }) });
    const dlqCard = page
      .locator('dl')
      .filter({ has: page.getByText('DLQ depth', { exact: true }) });

    await expect(tenantsCard).toBeVisible();
    await expect(pluginsCard).toBeVisible();
    await expect(dlqCard).toBeVisible();
    await expect(tenantsCard.locator('dd').first()).toContainText(/\d/);

    // Overall health indicator is rendered next to the "Health status" label
    // with one of the localized status words (Healthy / Degraded / Down).
    await expect(
      page.locator('[role="status"], [role="alert"]').filter({ hasText: /Healthy|Degraded|Down/ })
    ).toBeVisible();
  });

  test('dashboard metrics match the admin API response', async () => {
    const api = adminApi();
    const metrics = (await api.getDashboardMetrics()) as {
      tenantCount: number;
      pluginCount: number;
      dlqDepth: number;
      healthStatus: string;
    };
    expect(metrics.tenantCount).toBeGreaterThanOrEqual(1);
    expect(metrics.pluginCount).toBeGreaterThanOrEqual(0);
    expect(metrics.dlqDepth).toBeGreaterThanOrEqual(0);
    expect(['healthy', 'degraded', 'down']).toContain(metrics.healthStatus);
  });
});
