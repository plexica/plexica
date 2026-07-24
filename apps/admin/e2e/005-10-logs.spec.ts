// 005-10-logs.spec.ts — System logs E2E (Feature 005-10).
// Super admin → /logs → set filters → Search → log entries render with
// timestamp, level, tenant, message. The core HTTP path emits through its real
// Pino transport; the test reads only through the admin API.

import { expect, test } from './helpers/base-fixture.js';
import { loginAsAdmin, requireKeycloakInCI } from './helpers/admin-login.js';
import { adminApi } from './helpers/api-client.js';

const E2E_TENANT_SLUG = process.env['PLAYWRIGHT_ADMIN_E2E_TENANT_SLUG'] ?? 'e2e-admin';
const CORE_API_URL = process.env['PLAYWRIGHT_CORE_API_URL'] ?? 'http://localhost:3001';
const LOKI_URL = process.env['PLAYWRIGHT_LOKI_URL'] ?? 'http://localhost:3100';
const EXPECTED_MESSAGE = 'Tenant resolved';

async function isLokiReady(): Promise<boolean> {
  try {
    const response = await fetch(`${LOKI_URL}/ready`, {
      signal: AbortSignal.timeout(2_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

test.describe('005-10 System logs', () => {
  test.beforeAll(() => requireKeycloakInCI());

  test('searching logs returns entries with timestamp, level, tenant and message', async ({
    page,
  }) => {
    test.setTimeout(60_000);

    await expect.poll(isLokiReady, { timeout: 15_000 }).toBe(true);
    const emittedAfter = new Date().toISOString();
    const resolveResponse = await fetch(
      `${CORE_API_URL}/api/tenants/resolve?slug=${encodeURIComponent(E2E_TENANT_SLUG)}`,
      { signal: AbortSignal.timeout(5_000) }
    );
    expect(resolveResponse.ok).toBe(true);
    expect(await resolveResponse.json()).toEqual({ exists: true });

    await expect
      .poll(
        async () => {
          const result = (await adminApi().getLogs({
            tenant: E2E_TENANT_SLUG,
            level: 'info',
            start: emittedAfter,
            limit: 100,
          })) as { logs: Array<{ message: string; timestamp: string }> };
          return result.logs.some(
            (entry) => entry.message === EXPECTED_MESSAGE && entry.timestamp >= emittedAfter
          );
        },
        { timeout: 20_000, intervals: [250, 500, 1_000, 2_000] }
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
    const fixtureRow = table.getByRole('row').filter({ hasText: EXPECTED_MESSAGE }).first();
    await expect(fixtureRow).toBeVisible();
    await expect(fixtureRow.getByText(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/)).toBeVisible();
    await expect(fixtureRow.getByRole('img', { name: 'info' })).toBeVisible();
    await expect(fixtureRow).toContainText(E2E_TENANT_SLUG);
    await expect(fixtureRow).toContainText(EXPECTED_MESSAGE);
  });
});
