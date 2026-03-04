/**
 * Tenant Admin — Teams E2E Tests (T008-62)
 *
 * Covers:
 *   - Teams list page renders correctly
 *   - Teams are displayed from mock data
 *   - Create Team modal opens, validates, and submits
 *   - Delete confirmation modal appears for a team
 *
 * Spec 008 Admin Interfaces — Phase 8: Frontend Tests
 */

import { test, expect } from '@playwright/test';
import { mockAllApis } from './helpers/api-mocks';

test.describe('Tenant Admin — Teams', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page);
    await page.goto('/admin/teams');
    await expect(page.getByRole('heading', { name: 'Teams', level: 1 })).toBeVisible({
      timeout: 15000,
    });
  });

  test('should display the Teams page heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Teams', level: 1 })).toBeVisible();
  });

  test('should display the team list', async ({ page }) => {
    await expect(page.getByText('Engineering')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Core engineering team')).toBeVisible();
    await expect(page.getByText('Design')).toBeVisible();
    await expect(page.getByText('Product design team')).toBeVisible();
  });

  test('should show member counts for teams', async ({ page }) => {
    // Engineering has 5 members, Design has 3
    await expect(page.getByText(/5 member/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/3 member/i)).toBeVisible();
  });

  test('should display the Create team button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /create team/i })).toBeVisible();
  });

  test('should open create team modal', async ({ page }) => {
    await page.getByRole('button', { name: /create team/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await expect(dialog.getByRole('heading', { name: /create team/i })).toBeVisible();
    await expect(dialog.getByLabel(/team name/i)).toBeVisible();
  });

  test('should show validation error when team name is empty', async ({ page }) => {
    await page.getByRole('button', { name: /create team/i }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: /create/i }).click();
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 5000 });
  });

  test('should create a team and close modal', async ({ page }) => {
    await page.getByRole('button', { name: /create team/i }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(/team name/i).fill('New Test Team');
    await dialog.getByRole('button', { name: /create/i }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 });
  });

  test('should show delete confirmation for a team', async ({ page }) => {
    // Click a delete icon button for the first team
    const deleteButtons = page.getByRole('button', { name: /delete/i });
    await expect(deleteButtons.first()).toBeVisible({ timeout: 10000 });
    await deleteButtons.first().click();
    // A confirmation dialog should appear
    const confirmDialog = page.getByRole('dialog');
    await expect(confirmDialog).toBeVisible({ timeout: 5000 });
    await expect(confirmDialog.getByRole('button', { name: /delete/i })).toBeVisible();
  });

  test('should have links to individual team detail pages', async ({ page }) => {
    const teamLinks = page.getByRole('link', { name: 'Engineering' });
    await expect(teamLinks.first()).toBeVisible({ timeout: 10000 });
  });
});
