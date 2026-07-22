// 005-10-logs.spec.ts — System logs E2E (Feature 005-10).
// Super admin → /logs → set filters → Search → log entries render with
// timestamp, level, tenant, message. A uniquely identified log is pushed to the
// real Loki API and verified through the admin API before exercising the UI.

import { seedLokiLog } from '../../../e2e/fixtures/loki-fixture.js';

import { expect, test } from './helpers/base-fixture.js';
import { loginAsAdmin, requireKeycloakInCI } from './helpers/admin-login.js';
import { adminApi } from './helpers/api-client.js';

const E2E_TENANT_SLUG =
  process.env['PLAYWRIGHT_ADMIN_E2E_TENANT_SLUG'] ?? 'e2e-admin';

test.describe('005-10 System logs', () => {
  test.beforeAll(() => requireKeycloakInCI());

  test('searching logs returns entries with timestamp, level, tenant and message', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const fixtureMessage = await seedLokiLog(E2E_TENANT_SLUG);
    test.skip(
      fixtureMessage === null,
      'Local Loki opt-out was explicitly enabled with PLAYWRIGHT_ALLOW_MISSING_LOKI=true'
    );
    const expectedMessage = fixtureMessage!;

    await expect
      .poll(
        async () => {
          const result = (await adminApi().getLogs({
            tenant: E2E_TENANT_SLUG,
            level: 'info',
            limit: 100,
          })) as { logs: Array<{ message: string }> };
          return result.logs.some((entry) => entry.message === expectedMessage);
        },
        { timeout: 20_000, intervals: [250, 500, 1_000] }
      )
      .toBe(true);

    await loginAsAdmin(page);
    await page.goto('/logs');
    await expect(page.getByRole('heading', { level: 1, name: 'System Logs' })).toBeVisible();

    // Set filters: tenant = e2e-admin, level = info. Limit stays at default.
    await page.getByLabel('Tenant').fill(E2E_TENANT_SLUG);
    const levelSelect = page.getByRole('combobox', { name: 'Level' });
    await levelSelect.click();
    await page.getByRole('option', { name: 'Info', exact: true }).click();
    await expect(levelSelect).toHaveText('Info');

    // Explicit Search (no auto-search — Loki queries are expensive).
    const filteredRequest = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === 'GET' &&
        url.pathname === '/api/v1/admin/logs' &&
        url.searchParams.get('tenant') === E2E_TENANT_SLUG &&
        url.searchParams.get('level') === 'info'
      );
    });
    await page.getByRole('button', { name: /Search/ }).click();
    expect((await filteredRequest).status()).toBe(200);

    const table = page.getByRole('table');
    await expect(table).toBeVisible({ timeout: 15_000 });
    const fixtureRow = table.getByRole('row').filter({ hasText: expectedMessage });
    await expect(fixtureRow).toBeVisible();
    await expect(fixtureRow.getByText(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/)).toBeVisible();
    await expect(fixtureRow.getByRole('img', { name: 'info' })).toBeVisible();
    await expect(fixtureRow).toContainText(E2E_TENANT_SLUG);
    await expect(fixtureRow).toContainText(expectedMessage);
  });
});
