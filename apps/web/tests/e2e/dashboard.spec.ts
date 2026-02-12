/**
 * Dashboard E2E Tests
 *
 * Tests the main dashboard page:
 * - Metric cards with real data from API
 * - Active plugins widget
 * - Team members widget
 * - Quick actions navigation
 * - Recent activity section
 */

import { test, expect } from '@playwright/test';
import { mockAllApis } from './helpers/api-mocks';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 15000 });
  });

  test('should display dashboard heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
  });

  test('should display metric cards', async ({ page }) => {
    // Wait for data to load (metrics are fetched via useQuery)
    // Use .first() since "Active Plugins" appears as both a metric card label and widget heading
    await expect(page.getByText('Active Plugins').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Team Members').first()).toBeVisible();
    await expect(page.getByText('Teams').first()).toBeVisible();
  });

  test('should display active plugins widget', async ({ page }) => {
    // The Active Plugins widget should show installed plugins
    await expect(page.getByText('CRM Pro').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Analytics Dashboard').first()).toBeVisible();
  });

  test('should display team members widget', async ({ page }) => {
    await expect(page.getByText('Team Members').first()).toBeVisible({ timeout: 10000 });
    // Members from mock data
    await expect(page.getByText('Test User (E2E)').first()).toBeVisible();
  });

  test('should display quick actions section', async ({ page }) => {
    await expect(page.getByText('Quick Actions')).toBeVisible();
    // Quick action buttons have emoji prefixes (e.g., "📦 Browse Plugins")
    // Use exact name match to avoid matching sidebar/stat card buttons
    await expect(page.getByRole('button', { name: /📦 Browse Plugins/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /👥 Manage Members/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /⚙️ Workspace Settings/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /📝 View Activity/i })).toBeVisible();
  });

  test('should navigate to plugins page from quick actions', async ({ page }) => {
    await page.getByRole('button', { name: /Browse Plugins/i }).click();
    await page.waitForURL('**/plugins', { timeout: 5000 });
    await expect(page.getByRole('heading', { name: 'Plugins' })).toBeVisible();
  });

  test('should navigate to settings from quick actions', async ({ page }) => {
    await page.getByRole('button', { name: /Workspace Settings/i }).click();
    await page.waitForURL('**/settings', { timeout: 5000 });
    await expect(page.getByRole('heading', { name: 'Workspace Settings' })).toBeVisible();
  });

  test('should display recent activity section', async ({ page }) => {
    await expect(page.getByText('Recent Activity')).toBeVisible();
    // Activity tracking is "coming soon"
    await expect(page.getByText(/coming soon/i)).toBeVisible();
  });
});
