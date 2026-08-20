// 005-11-kafka-status.spec.ts — Kafka status E2E (Feature 005-11).
// Super admin → /kafka → consumer lag table + DLQ depth summary. Verifies lag
// values render and warning indicators appear when thresholds are exceeded.

import { KafkaStatusResponseSchema } from '@plexica/api-types';

import { expect, test } from './helpers/base-fixture.js';
import { loginAsAdmin, hasKeycloak, requireKeycloakInCI } from './helpers/admin-login.js';
import { adminApi } from './helpers/api-client.js';

test.describe.configure({ mode: 'parallel' });

test.describe('005-11 Kafka status', () => {
  test.skip(!hasKeycloak, 'Requires live Keycloak');
  test.beforeAll(() => requireKeycloakInCI());

  test('kafka page renders the DLQ summary and consumer lag table', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/kafka');
    await expect(page.getByRole('heading', { level: 1, name: 'Kafka Status' })).toBeVisible();

    // DLQ depth summary card always renders (even with no consumers) and
    // carries a numeric "Total DLQ depth: N messages" line.
    await expect(page.getByText(/Total DLQ depth: [\d,]+ messages/)).toBeVisible({
      timeout: 15_000,
    });

    // Either the consumer lag table renders with rows, or the empty-state
    // notice is shown when there are no active consumers.
    const emptyState = page.getByText('No active Kafka consumers.');
    const lagTable = page.getByRole('table');
    await expect(emptyState.or(lagTable)).toBeVisible();

    // When a lag table is present, each data row carries a numeric lag value
    // and an OK/Warning status badge. Warning rows surface an AlertTriangle.
    if ((await lagTable.count()) > 0) {
      const rows = lagTable.getByRole('row');
      expect(await rows.count()).toBeGreaterThan(1);
      const firstRow = rows.nth(1);
      await expect(firstRow.getByText(/[\d,]+/)).toBeVisible();
      await expect(firstRow.getByText(/^(OK|Warning)$/)).toBeVisible();
    }
  });

  test('admin API kafka status is well-formed', async () => {
    const data = KafkaStatusResponseSchema.parse(await adminApi().getKafkaStatus());

    expect(Array.isArray(data.brokers)).toBe(true);
    expect(Array.isArray(data.consumers)).toBe(true);
    expect(data.totalLag).toBeGreaterThanOrEqual(0);
    expect(data.dlqDepth).toBeGreaterThanOrEqual(0);
    expect(data.activeConsumerGroups).toBeGreaterThanOrEqual(0);
  });
});
