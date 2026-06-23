// workspace-templates.spec.ts
// E2E-10: Workspace templates (Spec 003, Phase 20.10).
// Tests /workspaces/templates: built-in template listing, card display, keyboard nav, axe.
// Create/instantiate UI is not yet implemented — those tests are skipped.
// Skips when Keycloak credentials are absent or the stack is not running.

import AxeBuilder from '@axe-core/playwright';

import { expect, test } from './helpers/base-fixture.js';
import { hasKeycloak, loginAsAdmin, requireKeycloakInCI } from './helpers/admin-login.js';

test.describe('E2E-10: Workspace templates', () => {
  test.skip(!hasKeycloak, 'Requires live Keycloak (PLAYWRIGHT_KEYCLOAK_* env vars)');

  test.beforeAll(() => {
    requireKeycloakInCI();
  });

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('built-in templates are visible on /workspaces/templates', async ({ page }) => {
    await page.goto('/workspaces/templates');
    await expect(page).toHaveURL(/\/workspaces\/templates/);

    // Page heading should be visible
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // At least one template card should be visible (TemplateCard renders <h3>{name}</h3>)
    await expect(page.getByRole('heading', { level: 3 }).first()).toBeVisible();
  });

  test('built-in template cards show "Built-in" badge and have no delete button', async ({
    page,
  }) => {
    await page.goto('/workspaces/templates');

    // Built-in templates have a "Built-in" badge
    await expect(page.getByText('Built-in').first()).toBeVisible();

    // No delete button should be visible on the page (templates page is read-only)
    const deleteBtn = page.getByRole('button', { name: /delete/i });
    await expect(deleteBtn).toHaveCount(0);
  });

  test('/workspaces/templates is keyboard-navigable', async ({ page }) => {
    await page.goto('/workspaces/templates');
    // Wait for page content
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement?.tagName ?? 'BODY');
    expect(focused).not.toBe('BODY');
  });

  test('/workspaces/templates passes axe-core accessibility check', async ({ page }) => {
    await page.goto('/workspaces/templates');
    // Wait for content to render
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations).toEqual([]);
  });
});
