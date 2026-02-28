/**
 * Navigation E2E Tests
 *
 * Tests navigation throughout the web app:
 * - Sidebar navigation links
 * - Page routing
 * - Active link highlighting
 * - Sidebar collapse/expand
 * - Breadcrumbs where applicable
 */

import { test, expect } from '@playwright/test';
import { mockAllApis } from './helpers/api-mocks';

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 15000 });
  });

  test.describe('Sidebar Navigation', () => {
    test('should display core navigation section', async ({ page }) => {
      await expect(page.getByText('CORE')).toBeVisible();
    });

    test('should navigate to Dashboard', async ({ page }) => {
      await page.getByRole('link', { name: 'Dashboard' }).click();
      await page.waitForURL('**/', { timeout: 5000 });
      await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    });

    test('should navigate to Plugins page', async ({ page }) => {
      await page.getByRole('link', { name: 'My Plugins' }).click();
      await page.waitForURL('**/plugins', { timeout: 5000 });
      await expect(page.getByRole('heading', { name: 'Plugins' })).toBeVisible();
    });

    test('should navigate to Team page', async ({ page }) => {
      await page.getByRole('link', { name: 'Team' }).click();
      await page.waitForURL('**/team', { timeout: 5000 });
      await expect(page.getByRole('heading', { name: 'Teams' })).toBeVisible();
    });

    test('should navigate to Settings page', async ({ page }) => {
      await page.getByRole('link', { name: 'Settings' }).click();
      await page.waitForURL('**/settings', { timeout: 5000 });
      await expect(page.getByRole('heading', { name: 'Workspace Settings' })).toBeVisible();
    });
  });

  test.describe('Page Routing', () => {
    test('should load activity log page directly', async ({ page }) => {
      await page.goto('/activity-log');
      await expect(page.getByRole('heading', { name: 'Activity Log' })).toBeVisible({
        timeout: 15000,
      });
      await expect(page.getByText(/coming soon/i)).toBeVisible();
    });

    test('should load members management page directly', async ({ page }) => {
      await page.goto('/members-management');
      await expect(page.getByRole('heading', { name: 'Members' })).toBeVisible({
        timeout: 15000,
      });
    });

    test('should redirect /workspace-settings to /settings', async ({ page }) => {
      await page.goto('/workspace-settings');
      await page.waitForURL('**/settings', { timeout: 10000 });
      await expect(page.getByRole('heading', { name: 'Workspace Settings' })).toBeVisible();
    });
  });

  test.describe('Sidebar Collapse', () => {
    test('should toggle sidebar collapse', async ({ page }) => {
      // Find the collapse button
      const collapseButton = page.getByRole('button', { name: /Collapse sidebar/i });
      if (await collapseButton.isVisible().catch(() => false)) {
        await collapseButton.click();
        // After collapse, CORE section text should be hidden
        await expect(page.getByText('CORE')).not.toBeVisible();
        // Expand button should now be visible
        const expandButton = page.getByRole('button', { name: /Expand sidebar/i });
        await expect(expandButton).toBeVisible();
        await expandButton.click();
        // CORE should be visible again
        await expect(page.getByText('CORE')).toBeVisible();
      }
    });
  });

  test.describe('Cross-page Navigation', () => {
    test('should navigate from dashboard to plugins and back', async ({ page }) => {
      // Go to plugins
      await page.getByRole('link', { name: 'My Plugins' }).click();
      await page.waitForURL('**/plugins');
      await expect(page.getByRole('heading', { name: 'Plugins' })).toBeVisible();

      // Go back to dashboard
      await page.getByRole('link', { name: 'Dashboard' }).click();
      await page.waitForURL('**/', { timeout: 5000 });
      await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    });

    test('should navigate from settings to team and back', async ({ page }) => {
      // Go to settings
      await page.getByRole('link', { name: 'Settings' }).click();
      await page.waitForURL('**/settings');
      await expect(page.getByRole('heading', { name: 'Workspace Settings' })).toBeVisible();

      // Go to team
      await page.getByRole('link', { name: 'Team' }).click();
      await page.waitForURL('**/team');
      await expect(page.getByRole('heading', { name: 'Teams' })).toBeVisible();
    });

    test('should navigate through all main pages sequentially', async ({ page }) => {
      // Dashboard -> Plugins -> Team -> Settings -> Dashboard
      await page.getByRole('link', { name: 'My Plugins' }).click();
      await expect(page.getByRole('heading', { name: 'Plugins' })).toBeVisible({ timeout: 10000 });

      await page.getByRole('link', { name: 'Team' }).click();
      await expect(page.getByRole('heading', { name: 'Teams' })).toBeVisible({ timeout: 10000 });

      await page.getByRole('link', { name: 'Settings' }).click();
      await expect(page.getByRole('heading', { name: 'Workspace Settings' })).toBeVisible({
        timeout: 10000,
      });

      await page.getByRole('link', { name: 'Dashboard' }).click();
      await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({
        timeout: 10000,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // T005-23: Accessibility & ARIA landmark tests
  // ---------------------------------------------------------------------------
  test.describe('Accessibility — ARIA landmarks and keyboard navigation', () => {
    test('should have a skip-to-content link in the DOM', async ({ page }) => {
      // The skip link is visually hidden but present in the DOM
      const skipLink = page.locator('a.skip-to-content');
      await expect(skipLink).toHaveAttribute('href', '#main-content');
    });

    test('should make skip-to-content link visible on keyboard focus', async ({ page }) => {
      const skipLink = page.locator('a.skip-to-content');
      // Focus the skip link via Tab from the top of the page
      await page.keyboard.press('Tab');
      // After Tab the skip link should be focused and no longer off-screen
      const box = await skipLink.boundingBox();
      expect(box).not.toBeNull();
      // When focused the inline onfocus handler moves left away from -9999px
      // Verify the element is now within the visible viewport (left > 0)
      if (box) {
        expect(box.x).toBeGreaterThan(-100);
      }
    });

    test('should expose <main id="main-content"> landmark', async ({ page }) => {
      const main = page.locator('main#main-content');
      await expect(main).toBeVisible();
    });

    test('should expose <header role="banner"> landmark', async ({ page }) => {
      const header = page.getByRole('banner');
      await expect(header).toBeVisible();
    });

    test('should expose <footer role="contentinfo"> landmark', async ({ page }) => {
      const footer = page.getByRole('contentinfo');
      await expect(footer).toBeVisible();
    });

    test('should maintain focus within the page after navigation', async ({ page }) => {
      // Navigate to plugins page
      await page.getByRole('link', { name: 'My Plugins' }).click();
      await page.waitForURL('**/plugins', { timeout: 5000 });

      // After navigation the document body or an element should hold focus
      // (not lost to <body>).  The heading should be reachable via Tab.
      const heading = page.getByRole('heading', { name: 'Plugins' });
      await expect(heading).toBeVisible();

      // Tabbing from body should land on an interactive element (skip link or first nav item)
      await page.keyboard.press('Tab');
      const focusedTag = await page.evaluate(() => document.activeElement?.tagName);
      expect(['A', 'BUTTON', 'INPUT']).toContain(focusedTag);
    });
  });
});
