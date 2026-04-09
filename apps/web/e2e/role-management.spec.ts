// role-management.spec.ts
// E2E-11: Role management page (Spec 003, Phase 20.11).
// Tests /roles: 4 role cards, action matrix, keyboard nav, axe.
// Skips when Keycloak credentials are absent or the stack is not running.

import AxeBuilder from '@axe-core/playwright';

import { expect, test } from './helpers/base-fixture.js';
import { hasKeycloak, loginAsAdmin, requireKeycloakInCI } from './helpers/admin-login.js';

// The 4 expected built-in roles (backend returns tenant_admin, admin, member, viewer)
const EXPECTED_ROLE_NAMES = ['tenant_admin', 'admin', 'member', 'viewer'];

test.describe('E2E-11: Role management', () => {
  test.skip(!hasKeycloak, 'Requires live Keycloak (PLAYWRIGHT_KEYCLOAK_* env vars)');

  test.beforeAll(() => {
    requireKeycloakInCI();
  });

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('navigate to /roles shows role cards with names', async ({ page }) => {
    await page.goto('/roles');
    await expect(page).toHaveURL(/\/roles/);

    // Page heading
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/roles/i);

    // Each expected role should have a visible h3 heading in a card
    for (const roleName of EXPECTED_ROLE_NAMES) {
      await expect(
        page.getByRole('heading', { level: 3, name: roleName, exact: true })
      ).toBeVisible();
    }
  });

  test('role cards show descriptions and action counts', async ({ page }) => {
    await page.goto('/roles');

    // Each role card is a <div> with an <h3> and <p> description
    // RoleCard renders: <h3>{role.name}</h3> <p>{role.description}</p> <p>{role.actionCount} actions</p>
    // There should be 4 role cards with non-empty descriptions
    const descriptions = page.locator('p').filter({ hasText: /access/i });
    await expect(descriptions.first()).toBeVisible();

    // At least one card shows an action count like "22 actions" or "14 actions"
    await expect(page.getByText(/\d+ actions/).first()).toBeVisible();
  });

  test('action matrix renders with Yes/No indicators', async ({ page }) => {
    await page.goto('/roles');

    // The ActionMatrixTable renders a <table> (no aria-label)
    const table = page.locator('table');
    await expect(table).toBeVisible({ timeout: 5_000 });

    // Table headers include "Action", "Admin (Tenant)", "Admin (WS)", "Member", "Viewer"
    await expect(table.locator('th', { hasText: /action/i })).toBeVisible();
    await expect(table.locator('th', { hasText: /member/i })).toBeVisible();
    await expect(table.locator('th', { hasText: /viewer/i })).toBeVisible();

    // Matrix uses Lucide icons with aria-label="Yes" and aria-label="No"
    await expect(table.locator('[aria-label="Yes"]').first()).toBeVisible();
    await expect(table.locator('[aria-label="No"]').first()).toBeVisible();
  });

  test('permission matrix section heading is visible', async ({ page }) => {
    await page.goto('/roles');

    // The section heading "Permission Matrix" (i18n key: roles.matrix.title)
    await expect(page.getByRole('heading', { level: 2, name: /permission matrix/i })).toBeVisible();
  });

  test('/roles is keyboard-navigable', async ({ page }) => {
    await page.goto('/roles');
    // Wait for content to load
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement?.tagName ?? 'BODY');
    expect(focused).not.toBe('BODY');
  });

  test('/roles passes axe-core accessibility check', async ({ page }) => {
    await page.goto('/roles');
    // Wait for content to render
    await expect(page.locator('table')).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations).toEqual([]);
  });
});
