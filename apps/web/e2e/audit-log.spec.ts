// audit-log.spec.ts
// E2E-09: Audit log (Spec 003, Phase 20.9).
// Performs actions → opens /audit-log → verifies entries, filters, metadata expand.
// Skips when Keycloak credentials are absent or the stack is not running.

import { expect, test } from './helpers/base-fixture.js';
import {
  hasKeycloak,
  loginAsAdmin,
  requireKeycloakInCI,
  uniqueName,
} from './helpers/admin-login.js';
import { createWorkspace } from './helpers/workspace.js';

test.describe('E2E-09: Audit log', () => {
  test.skip(!hasKeycloak, 'Requires live Keycloak (PLAYWRIGHT_KEYCLOAK_* env vars)');

  test.beforeAll(() => {
    requireKeycloakInCI();
  });

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('workspace.created event appears in audit log', async ({ page }) => {
    const wsName = uniqueName('audit-ws');
    await createWorkspace(page, { name: wsName });

    await page.goto('/audit-log');
    await expect(page).toHaveURL(/\/audit-log/);

    // The workspace creation event should appear
    await expect(page.getByText(/workspace\.created|workspace created/i)).toBeVisible({
      timeout: 10_000,
    });
  });

  test('invitation.sent event appears after sending invite', async ({ page }) => {
    const wsName = uniqueName('audit-inv-ws');
    await createWorkspace(page, { name: wsName });

    // Send an invitation
    await page.getByRole('link', { name: wsName }).click();
    await page.waitForURL(/\/workspaces\/[a-zA-Z0-9-]+/);
    await page.getByRole('link', { name: /members/i }).click();
    await page.getByRole('button', { name: /invite/i }).click();
    await page.getByLabel(/email/i).fill(`audit-${Date.now()}@e2e-test.local`);
    await page.getByRole('button', { name: /send invite|invite/i }).click();
    await page.getByText(/invitation sent/i).waitFor({ state: 'visible', timeout: 8_000 });

    await page.goto('/audit-log');
    await expect(page.getByText(/invitation\.sent|invitation sent/i)).toBeVisible({
      timeout: 10_000,
    });
  });

  test('action type filter narrows audit log entries', async ({ page }) => {
    await page.goto('/audit-log');

    const filterSelect = page
      .getByLabel(/filter.*action|action type|event type/i)
      .or(page.getByRole('combobox', { name: /action|event/i }));
    await filterSelect.selectOption({ label: 'workspace' });

    // After filtering, only workspace-related events should be shown
    await page.waitForTimeout(500);
    const rows = page.getByRole('row').filter({ hasText: /workspace/i });
    const nonWorkspaceRows = page.getByRole('row').filter({ hasNotText: /workspace/i });

    // At least one workspace row visible
    await expect(rows.first()).toBeVisible({ timeout: 5_000 });
    // Non-workspace rows (excluding header) should not include action column cells
    const nonWsCount = await nonWorkspaceRows.count();
    // Header row may remain; actual data rows should be filtered out
    expect(nonWsCount).toBeLessThanOrEqual(1);
  });

  test('date range filter narrows audit log entries', async ({ page }) => {
    await page.goto('/audit-log');

    const today = new Date().toISOString().split('T')[0] ?? '';
    const fromInput = page.getByLabel(/from date|start date|date from/i);
    const toInput = page.getByLabel(/to date|end date|date to/i);

    await fromInput.fill(today);
    await toInput.fill(today);
    await page.getByRole('button', { name: /apply|filter/i }).click();
    await page.waitForTimeout(500);

    // After filtering, entries from today should still be visible (we just created one)
    await expect(page.getByRole('table').or(page.getByRole('list'))).toBeVisible({
      timeout: 5_000,
    });
  });

  test('expand row shows metadata', async ({ page }) => {
    // Ensure at least one event exists
    const wsName = uniqueName('audit-expand');
    await createWorkspace(page, { name: wsName });

    await page.goto('/audit-log');
    // Click on the first row to expand it
    const firstRow = page.getByRole('row').nth(1); // skip header
    await firstRow.click();

    // Expanded metadata panel should appear
    await expect(
      page
        .getByRole('region', { name: /metadata|details/i })
        .or(page.locator('[data-testid="audit-row-detail"]'))
    ).toBeVisible({ timeout: 5_000 });
  });

  test('/audit-log page is keyboard-navigable', async ({ page }) => {
    await page.goto('/audit-log');
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement?.tagName ?? 'BODY');
    expect(focused).not.toBe('BODY');
  });
});
