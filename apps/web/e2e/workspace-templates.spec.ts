// workspace-templates.spec.ts
// E2E-10: Workspace templates (Spec 003, Phase 20.10).
// Tests built-in templates (read-only), custom template creation, and workspace instantiation.
// Skips when Keycloak credentials are absent or the stack is not running.

import AxeBuilder from '@axe-core/playwright';

import { expect, test } from './helpers/base-fixture.js';
import {
  hasKeycloak,
  loginAsAdmin,
  requireKeycloakInCI,
  uniqueName,
} from './helpers/admin-login.js';

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
    // At least one built-in template card should be visible
    await expect(page.getByRole('list').or(page.getByRole('grid'))).toBeVisible();
  });

  test('built-in templates have no delete button (read-only)', async ({ page }) => {
    await page.goto('/workspaces/templates');

    // Filter to built-in template cards (they should have a "built-in" badge or similar)
    const builtInCards = page
      .getByRole('article')
      .or(page.locator('[data-template-type="builtin"]'))
      .filter({ hasText: /built.in|default|system/i });

    const count = await builtInCards.count();
    if (count === 0) {
      // If no cards specifically marked built-in, check first card has no delete
      const firstCard = page.getByRole('article').first();
      const deleteBtn = firstCard.getByRole('button', { name: /delete/i });
      await expect(deleteBtn).not.toBeVisible();
    } else {
      // Check each built-in card has no delete button
      for (let i = 0; i < Math.min(count, 3); i++) {
        const card = builtInCards.nth(i);
        await expect(card.getByRole('button', { name: /delete/i })).not.toBeVisible();
      }
    }
  });

  test('create custom template with 2 child workspace definitions', async ({ page }) => {
    await page.goto('/workspaces/templates');

    const templateName = uniqueName('tmpl-custom');
    await page.getByRole('button', { name: /new template|create template/i }).click();

    // Fill template name
    await page.getByLabel(/template name/i).fill(templateName);

    // Add first child workspace definition
    await page.getByRole('button', { name: /add child|add workspace/i }).click();
    await page
      .getByLabel(/child.*name|workspace.*name/i)
      .first()
      .fill('Alpha');

    // Add second child workspace definition
    await page.getByRole('button', { name: /add child|add workspace/i }).click();
    await page
      .getByLabel(/child.*name|workspace.*name/i)
      .nth(1)
      .fill('Beta');

    await page.getByRole('button', { name: /save|create/i }).click();
    await expect(page.getByText(/saved|created/i)).toBeVisible({ timeout: 8_000 });

    // Template should appear in the list
    await expect(page.getByText(templateName)).toBeVisible();
  });

  test('create workspace from template — child workspaces instantiated', async ({ page }) => {
    // Pre-create a template (or use the one from the previous test — but tests must be independent)
    await page.goto('/workspaces/templates');
    const templateName = uniqueName('tmpl-inst');

    await page.getByRole('button', { name: /new template|create template/i }).click();
    await page.getByLabel(/template name/i).fill(templateName);
    await page.getByRole('button', { name: /add child|add workspace/i }).click();
    await page
      .getByLabel(/child.*name|workspace.*name/i)
      .first()
      .fill('Child-One');
    await page.getByRole('button', { name: /save|create/i }).click();
    await page.getByText(/saved|created/i).waitFor({ state: 'visible', timeout: 8_000 });

    // Use template to create a new workspace
    const wsName = uniqueName('ws-from-tmpl');
    await page.getByRole('button', { name: /new workspace/i }).click();
    await page.getByLabel(/workspace name/i).fill(wsName);
    // Select template
    const tmplSelect = page.getByLabel(/template/i);
    await tmplSelect.selectOption({ label: templateName });
    await page.getByRole('button', { name: /create/i }).click();

    // Root workspace appears in list
    await page.goto('/workspaces');
    await expect(page.getByRole('link', { name: wsName })).toBeVisible({ timeout: 10_000 });

    // Child workspace should also appear
    await expect(page.getByRole('link', { name: /child-one/i })).toBeVisible({ timeout: 5_000 });
  });

  test('/workspaces/templates is keyboard-navigable', async ({ page }) => {
    await page.goto('/workspaces/templates');
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement?.tagName ?? 'BODY');
    expect(focused).not.toBe('BODY');
  });

  test('/workspaces/templates passes axe-core accessibility check', async ({ page }) => {
    await page.goto('/workspaces/templates');
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations).toEqual([]);
  });
});
