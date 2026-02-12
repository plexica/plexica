/**
 * Plugin Management E2E Tests
 *
 * Tests plugin list rendering, search/filter by status and category,
 * plugin detail modal with stats, and admin actions (deprecate, delete).
 */

import { test, expect, Page } from '@playwright/test';
import { mockAllApis, MockPlugin } from './helpers/api-mocks';

const MOCK_PLUGINS: MockPlugin[] = [
  {
    id: 'plugin-1',
    name: 'Analytics Pro',
    version: '2.1.0',
    status: 'PUBLISHED',
    description: 'Advanced analytics and reporting plugin',
    category: 'analytics',
    author: 'Plexica Team',
    averageRating: 4.5,
    installCount: 15,
    ratingCount: 8,
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'plugin-2',
    name: 'CRM Integration',
    version: '1.0.0',
    status: 'DRAFT',
    description: 'Integrate your CRM system seamlessly',
    category: 'crm',
    author: 'Test Author',
    averageRating: 0,
    installCount: 0,
    ratingCount: 0,
    createdAt: '2026-01-10T00:00:00Z',
  },
  {
    id: 'plugin-3',
    name: 'Legacy Export',
    version: '0.9.0',
    status: 'DEPRECATED',
    description: 'Export data in legacy formats',
    category: 'tools',
    author: 'Dev Team',
    averageRating: 3.2,
    installCount: 42,
    ratingCount: 12,
    createdAt: '2025-06-01T00:00:00Z',
  },
];

async function setupApiMocks(page: Page) {
  await mockAllApis(page, {
    plugins: MOCK_PLUGINS,
    overview: {
      totalTenants: 5,
      activeTenants: 3,
      suspendedTenants: 1,
      provisioningTenants: 1,
      totalPlugins: 3,
      totalPluginInstallations: 57,
      totalUsers: 25,
      totalWorkspaces: 8,
    },
  });
}

test.describe('Plugin Management - List', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
    await page.goto('/plugins');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: 'Plugin Marketplace' })).toBeVisible({
      timeout: 10000,
    });
  });

  test('should render plugin cards with correct data', async ({ page }) => {
    // All plugins should be visible
    await expect(page.locator('h3', { hasText: 'Analytics Pro' })).toBeVisible();
    await expect(page.locator('h3', { hasText: 'CRM Integration' })).toBeVisible();
    await expect(page.locator('h3', { hasText: 'Legacy Export' })).toBeVisible();

    // Descriptions
    await expect(page.getByText('Advanced analytics and reporting plugin').first()).toBeVisible();

    // Authors
    await expect(page.getByText('By Plexica Team')).toBeVisible();
    await expect(page.getByText('By Test Author')).toBeVisible();
  });

  test('should display status badges on plugin cards', async ({ page }) => {
    // Status badges should be visible — use exact match to avoid matching <option> elements
    const analyticsCard = page.locator('[class*="card"]', {
      has: page.locator('h3', { hasText: 'Analytics Pro' }),
    });
    await expect(analyticsCard.getByText('PUBLISHED', { exact: true })).toBeVisible();

    const crmCard = page.locator('[class*="card"]', {
      has: page.locator('h3', { hasText: 'CRM Integration' }),
    });
    await expect(crmCard.getByText('DRAFT', { exact: true })).toBeVisible();

    const legacyCard = page.locator('[class*="card"]', {
      has: page.locator('h3', { hasText: 'Legacy Export' }),
    });
    await expect(legacyCard.getByText('DEPRECATED', { exact: true })).toBeVisible();
  });

  test('should show plugin stats summary', async ({ page }) => {
    // Stats bar — use getByText with regex to be specific
    await expect(page.getByText('total plugins')).toBeVisible();
    await expect(page.getByText(/\d+ published/)).toBeVisible();
    await expect(page.getByText(/\d+ categories/)).toBeVisible();
  });

  test('should filter plugins by search query', async ({ page }) => {
    const searchInput = page.locator(
      'input[placeholder="Search plugins by name, description, or author..."]'
    );
    await searchInput.fill('Analytics');

    // Wait for re-fetch
    await page.waitForTimeout(500);

    // Only Analytics Pro should remain
    await expect(page.locator('h3', { hasText: 'Analytics Pro' })).toBeVisible();
    // The grid should have exactly 1 card
    await expect(
      page.locator('[class*="grid"] [class*="card"]', { has: page.locator('h3') })
    ).toHaveCount(1, { timeout: 5000 });
  });

  test('should filter plugins by status', async ({ page }) => {
    // Find status filter select (second select, after category might vary - use option text)
    const statusSelect = page
      .locator('select')
      .filter({ has: page.locator('option:has-text("Published")') });
    await statusSelect.selectOption('DRAFT');

    // Only DRAFT plugin should be visible
    await expect(page.locator('h3', { hasText: 'CRM Integration' })).toBeVisible();
    await expect(page.locator('h3', { hasText: 'Analytics Pro' })).not.toBeVisible({
      timeout: 2000,
    });
  });

  test('should filter plugins by category', async ({ page }) => {
    // Find the category select
    const categorySelect = page
      .locator('select')
      .filter({ has: page.locator('option:has-text("All Categories")') });
    await categorySelect.selectOption('analytics');

    // Only analytics plugins should be visible
    await expect(page.locator('h3', { hasText: 'Analytics Pro' })).toBeVisible();
    await expect(page.locator('h3', { hasText: 'CRM Integration' })).not.toBeVisible({
      timeout: 2000,
    });
  });

  test('should show clear filters button when filters active', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Clear filters' })).not.toBeVisible();

    const searchInput = page.locator(
      'input[placeholder="Search plugins by name, description, or author..."]'
    );
    await searchInput.fill('test');

    await expect(page.getByRole('button', { name: 'Clear filters' })).toBeVisible();

    await page.getByRole('button', { name: 'Clear filters' }).click();

    // All plugins visible again
    await expect(page.locator('h3', { hasText: 'Analytics Pro' })).toBeVisible();
    await expect(page.locator('h3', { hasText: 'CRM Integration' })).toBeVisible();
    await expect(page.locator('h3', { hasText: 'Legacy Export' })).toBeVisible();
  });

  test('should show Marketplace and Review Queue tabs', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Marketplace' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Review Queue' })).toBeVisible();
  });

  test('should have Publish Plugin button', async ({ page }) => {
    await expect(page.getByRole('button', { name: '+ Publish Plugin' })).toBeVisible();
  });
});

test.describe('Plugin Management - Detail Modal', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
    await page.goto('/plugins');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: 'Plugin Marketplace' })).toBeVisible({
      timeout: 10000,
    });
  });

  test('should open plugin detail modal when clicking plugin name', async ({ page }) => {
    // Click on plugin name
    await page.locator('h3', { hasText: 'Analytics Pro' }).click();

    // Modal should open
    await expect(page.locator('h2', { hasText: 'Analytics Pro' })).toBeVisible({ timeout: 5000 });
    // Version should be visible in the modal
    await expect(page.locator('.fixed').getByText('v2.1.0', { exact: true })).toBeVisible();
  });

  test('should open plugin detail modal when clicking View button', async ({ page }) => {
    // Find the Analytics Pro card and click View
    const card = page
      .locator('[class*="card"]', { has: page.locator('h3', { hasText: 'Analytics Pro' }) })
      .first();
    await card.getByRole('button', { name: 'View' }).click();

    await expect(page.locator('h2', { hasText: 'Analytics Pro' })).toBeVisible({ timeout: 5000 });
  });

  test('should display plugin statistics in detail modal', async ({ page }) => {
    await page.locator('h3', { hasText: 'Analytics Pro' }).click();
    await expect(page.locator('h2', { hasText: 'Analytics Pro' })).toBeVisible({ timeout: 5000 });

    const modal = page.locator('.fixed');

    // Statistics section
    await expect(modal.getByText('Installs')).toBeVisible();
    await expect(modal.getByText('Rating')).toBeVisible();
    await expect(modal.getByText('Reviews')).toBeVisible();

    // Values from mock data
    await expect(modal.getByText('15')).toBeVisible(); // installCount
    await expect(modal.getByText('4.5/5')).toBeVisible(); // averageRating
    await expect(modal.getByText('8')).toBeVisible(); // ratingCount
  });

  test('should show Deprecate button for PUBLISHED plugins', async ({ page }) => {
    await page.locator('h3', { hasText: 'Analytics Pro' }).click();
    await expect(page.locator('h2', { hasText: 'Analytics Pro' })).toBeVisible({ timeout: 5000 });

    await expect(page.getByRole('button', { name: 'Deprecate' })).toBeVisible();
    // Should NOT show Delete for PUBLISHED
    await expect(page.getByRole('button', { name: 'Delete Plugin' })).not.toBeVisible();
  });

  test('should show Delete button for DRAFT plugins', async ({ page }) => {
    await page.locator('h3', { hasText: 'CRM Integration' }).click();
    await expect(page.locator('h2', { hasText: 'CRM Integration' })).toBeVisible({
      timeout: 5000,
    });

    await expect(page.getByRole('button', { name: 'Delete Plugin' })).toBeVisible();
    // Should NOT show Deprecate for DRAFT
    await expect(page.getByRole('button', { name: 'Deprecate' })).not.toBeVisible();
  });

  test('should show Delete button for DEPRECATED plugins', async ({ page }) => {
    await page.locator('h3', { hasText: 'Legacy Export' }).click();
    await expect(page.locator('h2', { hasText: 'Legacy Export' })).toBeVisible({ timeout: 5000 });

    await expect(page.getByRole('button', { name: 'Delete Plugin' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Deprecate' })).not.toBeVisible();
  });

  test('should show plugin description in detail modal', async ({ page }) => {
    await page.locator('h3', { hasText: 'Analytics Pro' }).click();
    await expect(page.locator('h2', { hasText: 'Analytics Pro' })).toBeVisible({ timeout: 5000 });

    // Description appears both in the card and in the modal — scope to the modal
    const modal = page.locator('.fixed');
    await expect(modal.getByText('Advanced analytics and reporting plugin')).toBeVisible();
  });

  test('should show plugin basic info in detail modal', async ({ page }) => {
    await page.locator('h3', { hasText: 'Analytics Pro' }).click();
    await expect(page.locator('h2', { hasText: 'Analytics Pro' })).toBeVisible({ timeout: 5000 });

    const modal = page.locator('.fixed');
    // Plugin ID
    await expect(modal.getByText('plugin-1')).toBeVisible();
    // Author — use exact match to avoid matching "By Plexica Team" on the card behind the modal
    await expect(modal.getByText('Plexica Team', { exact: true })).toBeVisible();
    // Category — use exact match to avoid matching "Analytics Pro", description, etc.
    await expect(modal.getByText('analytics', { exact: true })).toBeVisible();
  });

  test('should show Manage Versions and View Analytics buttons', async ({ page }) => {
    await page.locator('h3', { hasText: 'Analytics Pro' }).click();
    await expect(page.locator('h2', { hasText: 'Analytics Pro' })).toBeVisible({ timeout: 5000 });

    await expect(page.getByRole('button', { name: 'Manage Versions' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'View Analytics' })).toBeVisible();
  });

  test('should close detail modal with Close button', async ({ page }) => {
    await page.locator('h3', { hasText: 'Analytics Pro' }).click();
    await expect(page.locator('h2', { hasText: 'Analytics Pro' })).toBeVisible({ timeout: 5000 });

    await page.getByRole('button', { name: 'Close' }).click();

    await expect(page.locator('h2', { hasText: 'Analytics Pro' })).not.toBeVisible({
      timeout: 3000,
    });
  });
});
