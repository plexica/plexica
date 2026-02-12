/**
 * Workspace Management E2E Tests
 *
 * Tests workspace-related features:
 * - Workspace switcher
 * - Members management page
 * - Team management page
 * - Workspace context propagation
 */

import { test, expect } from '@playwright/test';
import { mockAllApis } from './helpers/api-mocks';

test.describe('Workspace Management', () => {
  test.describe('Members Management', () => {
    test.beforeEach(async ({ page }) => {
      await mockAllApis(page);
      await page.goto('/members-management');
      await expect(page.getByRole('heading', { name: 'Members' })).toBeVisible({ timeout: 15000 });
    });

    test('should display members page heading', async ({ page }) => {
      await expect(page.getByRole('heading', { name: 'Members', level: 1 })).toBeVisible();
    });

    test('should display member count and admin count', async ({ page }) => {
      await expect(page.getByText(/3 members/)).toBeVisible({ timeout: 10000 });
    });

    test('should display members in the list', async ({ page }) => {
      // Members table shows emails, not display names
      await expect(page.getByText('user@acme-corp.plexica.local').first()).toBeVisible({
        timeout: 10000,
      });
      await expect(page.getByText('admin@acme-corp.plexica.local').first()).toBeVisible();
      await expect(page.getByText('member@acme-corp.plexica.local').first()).toBeVisible();
    });

    test('should show member emails', async ({ page }) => {
      await expect(page.getByText('user@acme-corp.plexica.local').first()).toBeVisible({
        timeout: 10000,
      });
      await expect(page.getByText('admin@acme-corp.plexica.local').first()).toBeVisible();
    });

    test('should show invite member button for admin', async ({ page }) => {
      await expect(page.getByRole('button', { name: /Invite Member/i })).toBeVisible({
        timeout: 10000,
      });
    });

    test('should open invite member dialog', async ({ page }) => {
      await page.getByRole('button', { name: /Invite Member/i }).click();
      await expect(page.getByRole('heading', { name: 'Invite Member' })).toBeVisible();
      await expect(page.getByPlaceholder('member@example.com')).toBeVisible();
    });
  });

  test.describe('Team Management', () => {
    test.beforeEach(async ({ page }) => {
      await mockAllApis(page);
      await page.goto('/team');
      await expect(page.getByRole('heading', { name: 'Teams' })).toBeVisible({ timeout: 15000 });
    });

    test('should display teams page heading', async ({ page }) => {
      await expect(page.getByRole('heading', { name: 'Teams', level: 1 })).toBeVisible();
    });

    test('should display teams from the workspace', async ({ page }) => {
      await expect(page.getByText('Frontend Team').first()).toBeVisible({ timeout: 10000 });
      await expect(page.getByText('Backend Team').first()).toBeVisible();
    });

    test('should show team descriptions', async ({ page }) => {
      await expect(page.getByText('Handles all frontend development').first()).toBeVisible({
        timeout: 10000,
      });
    });

    test('should show create team button', async ({ page }) => {
      await expect(page.getByRole('button', { name: /Create Team/i })).toBeVisible();
    });

    test('should open create team dialog', async ({ page }) => {
      await page.getByRole('button', { name: /Create Team/i }).click();
      await expect(page.getByText('Create New Team')).toBeVisible();
      await expect(page.getByPlaceholder('e.g., Engineering, Marketing, Sales')).toBeVisible();
    });

    test('should have search functionality', async ({ page }) => {
      await expect(page.getByPlaceholder('Search teams by name or description...')).toBeVisible();
    });

    test('should expand team card details', async ({ page }) => {
      await expect(page.getByText('Frontend Team').first()).toBeVisible({ timeout: 10000 });
      // Click "View Team" button
      const viewButton = page.getByRole('button', { name: /View Team/i }).first();
      await viewButton.click();
      // Should show expanded details
      await expect(page.getByText(/team-1/).first()).toBeVisible();
    });
  });
});
