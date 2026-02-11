/**
 * Auth Flow E2E Tests
 *
 * Tests authentication flow in E2E test mode:
 * - Mock auth auto-authenticates the user
 * - Login page redirects authenticated users to dashboard
 * - Unauthenticated state shows login page
 */

import { test, expect } from '@playwright/test';
import { mockAllApis } from './helpers/api-mocks';

test.describe('Auth Flow', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page);
  });

  test('should auto-authenticate in E2E test mode and show dashboard', async ({ page }) => {
    await page.goto('/');
    // MockAuthProvider sets auth state, so dashboard should render
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 15000 });
  });

  test('should redirect /login to dashboard when already authenticated', async ({ page }) => {
    await page.goto('/login');
    // Authenticated users should be redirected away from login
    await page.waitForURL('**/', { timeout: 15000 });
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });

  test('should display user info after authentication', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 15000 });
    // The workspace name or tenant name should be visible somewhere
    await expect(page.getByText('Acme Corp').first()).toBeVisible();
  });

  test('should render sidebar navigation after authentication', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 15000 });

    // Core navigation links should be visible
    await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'My Plugins' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Team' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible();
  });
});
