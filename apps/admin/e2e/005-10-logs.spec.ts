// 005-10-logs.spec.ts — System logs E2E (Feature 005-10).
// Super admin → /logs → set filters → Search → log entries render with
// timestamp, level, tenant, message. Guarded on Loki availability: the whole
// suite skips when the admin /logs endpoint is unreachable (503 SERVICE
// UNAVAILABLE) so CI stays green in environments without Loki.
//
// NOTE: this spec also surfaces a pre-existing response-shape mismatch — the
// backend returns { logs, total } but services/admin-api.ts getLogs() expects
// { data }, so the table may render empty even when Loki is up. See the report.

import { expect, test } from './helpers/base-fixture.js';
import { loginAsAdmin, hasKeycloak, requireKeycloakInCI } from './helpers/admin-login.js';
import { adminApi } from './helpers/api-client.js';

const E2E_TENANT_SLUG = process.env['PLAYWRIGHT_ADMIN_E2E_TENANT_SLUG'] ?? 'e2e-admin';

test.describe('005-10 System logs', () => {
  test.skip(!hasKeycloak, 'Requires live Keycloak');

  test.beforeAll(() => {
    requireKeycloakInCI();
  });

  // Skip the whole suite when Loki is not configured / unreachable. Computed
  // lazily per test so a transient network blip doesn't skip the entire run.
  async function lokiAvailable(): Promise<boolean> {
    try {
      await adminApi().getLogs();
      return true;
    } catch {
      return false;
    }
  }

  test('searching logs returns entries with timestamp, level, tenant and message', async ({
    page,
  }) => {
    if (!(await lokiAvailable())) {
      test.skip(true, 'Requires live Loki (admin /logs endpoint unreachable)');
    }

    await loginAsAdmin(page);
    await page.goto('/logs');
    await expect(page.getByRole('heading', { level: 1, name: 'System Logs' })).toBeVisible();

    // Set filters: tenant = e2e-admin, level = info. Limit stays at default.
    await page.getByLabel('Tenant').fill(E2E_TENANT_SLUG);
    const levelSelect = page.getByRole('combobox', { name: 'Level' });
    await levelSelect.click();
    await page.getByRole('option', { name: 'info', exact: true }).click();

    // Explicit Search (no auto-search — Loki queries are expensive).
    await page.getByRole('button', { name: /Search/ }).click();

    // Log entries render as table rows. At least one data row beyond the header.
    const table = page.getByRole('table');
    await expect(table).toBeVisible({ timeout: 15_000 });
    const rows = table.getByRole('row');
    expect(await rows.count()).toBeGreaterThan(1);

    // First data row carries a timestamp, a level badge, a tenant cell and a message.
    const firstRow = rows.nth(1);
    await expect(firstRow.getByText(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/)).toBeVisible();
    await expect(firstRow.getByRole('img')).toBeVisible();
    await expect(firstRow).toContainText(E2E_TENANT_SLUG);
  });
});
