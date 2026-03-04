/**
 * Tenant Admin — Roles E2E Tests (T008-62)
 *
 * Covers:
 *   - Roles list page renders correctly
 *   - System roles are displayed with lock icon indicator
 *   - Custom roles are displayed with edit links
 *   - Create Role navigates to the new role form
 *   - Delete confirmation modal for custom roles
 *
 * Spec 008 Admin Interfaces — Phase 8: Frontend Tests
 */

import { test, expect } from '@playwright/test';
import { mockAllApis } from './helpers/api-mocks';

test.describe('Tenant Admin — Roles', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page);
    await page.goto('/admin/roles');
    await expect(page.getByRole('heading', { name: 'Roles', level: 1 })).toBeVisible({
      timeout: 15000,
    });
  });

  test('should display the Roles page heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Roles', level: 1 })).toBeVisible();
  });

  test('should display system roles', async ({ page }) => {
    await expect(page.getByText('Admin')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Full administrative access')).toBeVisible();
    await expect(page.getByText('Member')).toBeVisible();
    await expect(page.getByText('Standard member access')).toBeVisible();
  });

  test('should display custom roles', async ({ page }) => {
    await expect(page.getByText('Read-Only Reporter')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Can view dashboards and export reports')).toBeVisible();
  });

  test('should mark system roles with a badge or indicator', async ({ page }) => {
    // System roles have isSystem=true — the component renders a Lock icon with aria-label
    const systemRoleIndicator = page.getByLabel('System role').first();
    await expect(systemRoleIndicator).toBeVisible({ timeout: 10000 });
  });

  test('should show System badge for system roles', async ({ page }) => {
    const systemBadges = page.getByText('System');
    await expect(systemBadges.first()).toBeVisible({ timeout: 10000 });
  });

  test('should display Create role button', async ({ page }) => {
    await expect(page.getByRole('link', { name: /create role/i })).toBeVisible();
  });

  test('should navigate to create role page', async ({ page }) => {
    await page.getByRole('link', { name: /create role/i }).click();
    await page.waitForURL('**/admin/roles/new', { timeout: 5000 });
  });

  test('should show edit link for custom roles', async ({ page }) => {
    // Custom role "Read-Only Reporter" is a link (non-system roles are editable)
    const customRoleLink = page.getByRole('link', { name: 'Read-Only Reporter' });
    await expect(customRoleLink).toBeVisible({ timeout: 10000 });
  });

  test('should show delete button for custom roles', async ({ page }) => {
    const deleteButtons = page.getByRole('button', { name: /delete/i });
    await expect(deleteButtons.first()).toBeVisible({ timeout: 10000 });
  });

  test('should open delete confirmation for custom roles', async ({ page }) => {
    const deleteButtons = page.getByRole('button', { name: /delete/i });
    await deleteButtons.first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await expect(dialog.getByRole('button', { name: /delete/i })).toBeVisible();
  });
});
