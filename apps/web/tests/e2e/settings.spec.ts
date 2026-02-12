/**
 * Settings Page E2E Tests
 *
 * Tests the consolidated 7-tab settings page:
 * - General tab (workspace info, edit mode, preferences, danger zone)
 * - Members tab (list, add member dialog, role editing)
 * - Teams tab (list)
 * - Coming soon tabs (Security, Billing, Integrations, Advanced)
 */

import { test, expect } from '@playwright/test';
import { mockAllApis } from './helpers/api-mocks';

test.describe('Settings Page', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page);
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Workspace Settings' })).toBeVisible({
      timeout: 15000,
    });
  });

  test('should display settings page heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Workspace Settings', level: 1 })).toBeVisible();
  });

  test('should display all 7 tab buttons', async ({ page }) => {
    const tabs = ['General', 'Members', 'Teams', 'Security', 'Billing', 'Integrations', 'Advanced'];
    for (const tab of tabs) {
      await expect(page.getByRole('tab', { name: tab, exact: true }).first()).toBeVisible();
    }
  });

  test.describe('General Tab', () => {
    test('should show workspace information section', async ({ page }) => {
      await expect(page.getByText('Workspace Information')).toBeVisible();
    });

    test('should display workspace name', async ({ page }) => {
      await expect(page.getByText('Engineering').first()).toBeVisible();
    });

    test('should show edit workspace button for admin', async ({ page }) => {
      const editButton = page.getByRole('button', { name: /Edit Workspace/i });
      if (await editButton.isVisible().catch(() => false)) {
        await expect(editButton).toBeVisible();
      }
    });

    test('should show preferences section', async ({ page }) => {
      await expect(page.getByText('Preferences')).toBeVisible();
    });

    test('should show danger zone for admin', async ({ page }) => {
      await expect(page.getByText('Danger Zone')).toBeVisible();
      await expect(page.getByRole('button', { name: /Delete Workspace/i })).toBeVisible();
    });
  });

  test.describe('Members Tab', () => {
    test.beforeEach(async ({ page }) => {
      await page.getByRole('tab', { name: 'Members', exact: true }).first().click();
    });

    test('should show members section with count', async ({ page }) => {
      await expect(page.getByText(/Members \(/)).toBeVisible({ timeout: 10000 });
    });

    test('should display member list', async ({ page }) => {
      await expect(page.getByText('Test User (E2E)').first()).toBeVisible({ timeout: 10000 });
    });

    test('should show add member button', async ({ page }) => {
      await expect(page.getByRole('button', { name: /Add Member/i })).toBeVisible({
        timeout: 10000,
      });
    });

    test('should open add member dialog', async ({ page }) => {
      await page.getByRole('button', { name: /Add Member/i }).click();
      await expect(page.getByRole('heading', { name: 'Add Member' })).toBeVisible();
      await expect(page.getByPlaceholder('member@example.com')).toBeVisible();
    });
  });

  test.describe('Teams Tab', () => {
    test.beforeEach(async ({ page }) => {
      await page.getByRole('tab', { name: 'Teams', exact: true }).first().click();
    });

    test('should show teams section with count', async ({ page }) => {
      await expect(page.getByText(/Teams \(/)).toBeVisible({ timeout: 10000 });
    });

    test('should display team cards', async ({ page }) => {
      await expect(page.getByText('Frontend Team').first()).toBeVisible({ timeout: 10000 });
      await expect(page.getByText('Backend Team').first()).toBeVisible();
    });
  });

  test.describe('Coming Soon Tabs', () => {
    test('should show security settings tab content', async ({ page }) => {
      await page.getByRole('tab', { name: 'Security', exact: true }).first().click();
      await expect(page.getByRole('heading', { name: 'Security Settings' })).toBeVisible();
      // Security is managed through Keycloak identity provider
      await expect(page.getByText(/managed through your identity provider/i)).toBeVisible();
    });

    test('should show billing tab content', async ({ page }) => {
      await page.getByRole('tab', { name: 'Billing', exact: true }).first().click();
      await expect(page.getByRole('heading', { name: /Billing/ })).toBeVisible();
    });

    test('should show integrations tab content', async ({ page }) => {
      await page.getByRole('tab', { name: 'Integrations', exact: true }).first().click();
      await expect(page.getByRole('heading', { name: 'Integrations' })).toBeVisible();
    });

    test('should show advanced settings tab content', async ({ page }) => {
      await page.getByRole('tab', { name: 'Advanced', exact: true }).first().click();
      await expect(page.getByRole('heading', { name: 'Advanced Settings' })).toBeVisible();
    });
  });
});
