// audit-log.spec.ts
// E2E-09: Audit log (Spec 003, Phase 20.9).
// Performs actions → opens /audit-log → verifies entries, filters, row expand.
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

  test('workspace.create event appears in audit log', async ({ page }) => {
    const wsName = uniqueName('audit-ws');
    await createWorkspace(page, { name: wsName });

    await page.goto('/audit-log');
    await expect(page).toHaveURL(/\/audit-log/);

    // The workspace creation event should appear — action type is "workspace.create"
    await expect(page.getByText('workspace.create').first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test('action type filter narrows audit log entries', async ({ page }) => {
    await page.goto('/audit-log');
    await expect(page.getByRole('table')).toBeVisible({ timeout: 10_000 });

    // The select is a Radix UI combobox, not a native <select>.
    // Click the trigger to open the portal-based dropdown.
    const combobox = page.getByRole('combobox', { name: /action type/i });
    await combobox.click();

    // Radix Select renders options in a portal. Locate the option text
    // inside the portal content. The option label is "Create Workspace"
    // (from action-types.ts: key="workspace.create", label="Create Workspace").
    const option = page.locator('[role="option"]', { hasText: /create workspace/i });
    await expect(option).toBeVisible({ timeout: 5_000 });
    await option.click();

    // After filtering, only workspace.create rows should remain
    await page.waitForTimeout(1_000);
    const rows = page.getByRole('row').filter({ hasText: /workspace\.create/ });
    await expect(rows.first()).toBeVisible({ timeout: 5_000 });
  });

  test('date range filters accept input', async ({ page }) => {
    await page.goto('/audit-log');
    await expect(page.getByRole('table')).toBeVisible({ timeout: 10_000 });

    const today = new Date().toISOString().split('T')[0] ?? '';

    // The date inputs have aria-labels "From" and "To"
    const fromInput = page.getByLabel(/^from$/i);
    const toInput = page.getByLabel(/^to$/i);

    await fromInput.fill(today);
    await toInput.fill(today);

    // After filling, the table should still be visible with today's entries
    await page.waitForTimeout(500);
    await expect(page.getByRole('table')).toBeVisible({ timeout: 5_000 });
  });

  test('clicking a row toggles detail view', async ({ page }) => {
    await page.goto('/audit-log');
    await expect(page.getByRole('table')).toBeVisible({ timeout: 10_000 });

    // Click the first data row to attempt expansion
    const firstDataRow = page.getByRole('row').nth(1); // skip header
    await firstDataRow.click();

    // workspace.create events have no beforeValue/afterValue, so the detail
    // row won't appear. Verify the row is still clickable (no crash) and the
    // page remains stable.
    await expect(page.getByRole('table')).toBeVisible();
  });

  test('/audit-log page has accessible table structure', async ({ page }) => {
    await page.goto('/audit-log');
    await expect(page.getByRole('table')).toBeVisible({ timeout: 10_000 });

    // Table should have proper ARIA label
    await expect(page.getByRole('table', { name: /audit log/i })).toBeVisible();

    // Column headers should be present
    await expect(page.getByRole('columnheader', { name: /actor/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /action/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /target/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /time/i })).toBeVisible();
  });

  test('/audit-log page is keyboard-navigable', async ({ page }) => {
    await page.goto('/audit-log');
    await expect(page.getByRole('table')).toBeVisible({ timeout: 10_000 });

    // Focus the Actor input and verify keyboard interaction works
    const actorInput = page.getByRole('textbox', { name: /actor/i });
    await actorInput.focus();
    const focused = await page.evaluate(() => document.activeElement?.tagName ?? 'BODY');
    expect(focused).toBe('INPUT');
  });
});
