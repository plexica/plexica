/**
 * Tenant Admin — Users E2E Tests (T008-62)
 *
 * Covers:
 *   - Users page renders with heading and table
 *   - User list displays mocked users
 *   - Search input visible
 *   - Invite User modal opens, validates email, submits successfully
 *   - Deactivate button visible for active users
 *
 * Spec 008 Admin Interfaces — Phase 8: Frontend Tests
 */

import { test, expect } from '@playwright/test';
import { mockAllApis } from './helpers/api-mocks';

test.describe('Tenant Admin — Users', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page);
    await page.goto('/admin/users');
    await expect(page.getByRole('heading', { name: 'Users', level: 1 })).toBeVisible({
      timeout: 15000,
    });
  });

  test('should display the Users page heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Users', level: 1 })).toBeVisible();
    await expect(page.getByText('Manage tenant members and invitations')).toBeVisible();
  });

  test('should display the user list', async ({ page }) => {
    await expect(page.getByText('Alice Admin')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('alice@acme-corp.plexica.local')).toBeVisible();
    await expect(page.getByText('Bob Member')).toBeVisible();
    await expect(page.getByText('Charlie Invited')).toBeVisible();
  });

  test('should show status badges for users', async ({ page }) => {
    // Alice and Bob are active; Charlie is invited
    const activeBadges = page.getByText('Active');
    await expect(activeBadges.first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Invited')).toBeVisible();
  });

  test('should display search input', async ({ page }) => {
    await expect(page.getByRole('searchbox', { name: /search users/i })).toBeVisible();
  });

  test('should display the Invite user button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /invite user/i })).toBeVisible();
  });

  test('should open invite modal when clicking Invite user', async ({ page }) => {
    await page.getByRole('button', { name: /invite user/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await expect(dialog.getByRole('heading', { name: 'Invite User' })).toBeVisible();
    await expect(dialog.getByLabel(/email address/i)).toBeVisible();
  });

  test('should show validation error for invalid email', async ({ page }) => {
    await page.getByRole('button', { name: /invite user/i }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(/email address/i).fill('not-an-email');
    await dialog.getByRole('button', { name: /send invitation/i }).click();
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 5000 });
  });

  test('should submit invite successfully and close modal', async ({ page }) => {
    await page.getByRole('button', { name: /invite user/i }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(/email address/i).fill('newuser@example.com');
    await dialog.getByRole('button', { name: /send invitation/i }).click();
    // Modal should close after successful invite
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 });
  });

  test('should show Deactivate button for active users', async ({ page }) => {
    // Active users (Alice, Bob) should have a Deactivate button
    const deactivateButtons = page.getByRole('button', { name: /deactivate/i });
    await expect(deactivateButtons.first()).toBeVisible({ timeout: 10000 });
  });
});
