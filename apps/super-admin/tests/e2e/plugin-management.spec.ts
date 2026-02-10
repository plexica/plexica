/**
 * Plugin Management E2E Tests
 *
 * Tests plugin list rendering, search/filter by status and category,
 * plugin detail modal with stats, and admin actions (deprecate, delete).
 */

import { test, expect, Page } from '@playwright/test';

const MOCK_PLUGINS = [
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
  // Mock analytics overview
  await page.route('**/api/admin/analytics/overview*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        totalTenants: 5,
        activeTenants: 3,
        suspendedTenants: 1,
        provisioningTenants: 1,
        totalPlugins: 3,
        totalPluginInstallations: 57,
        totalUsers: 25,
        totalWorkspaces: 8,
      }),
    });
  });

  // Mock plugins list
  await page.route('**/api/admin/plugins*', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    // GET specific plugin by ID
    if (method === 'GET' && url.match(/\/plugins\/plugin-\d+$/)) {
      const pluginId = url.split('/').pop();
      const plugin = MOCK_PLUGINS.find((p) => p.id === pluginId);
      if (plugin) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(plugin),
        });
      } else {
        await route.fulfill({ status: 404 });
      }
      return;
    }

    // PATCH deprecate plugin
    if (method === 'PATCH') {
      const pluginId = url.split('/plugins/')[1]?.split('/')[0]?.split('?')[0];
      const plugin = MOCK_PLUGINS.find((p) => p.id === pluginId);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...plugin, status: 'DEPRECATED' }),
      });
      return;
    }

    // DELETE plugin
    if (method === 'DELETE') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Plugin deleted successfully' }),
      });
      return;
    }

    // Avoid matching analytics sub-routes
    if (url.includes('/analytics')) {
      return route.continue();
    }

    // GET plugins list
    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: MOCK_PLUGINS,
          pagination: {
            page: 1,
            limit: 50,
            total: MOCK_PLUGINS.length,
            totalPages: 1,
          },
        }),
      });
    }
  });

  // Mock other endpoints to prevent errors
  await page.route('**/api/admin/tenants*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ tenants: [], total: 0, page: 1, limit: 50, totalPages: 0 }),
    });
  });
  await page.route('**/api/admin/users*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ users: [], total: 0, page: 1, limit: 50, totalPages: 0 }),
    });
  });
  await page.route('**/api/admin/analytics/tenants*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [] }),
    });
  });
  await page.route('**/api/admin/analytics/plugins*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ plugins: [] }),
    });
  });
  await page.route('**/api/admin/analytics/api-calls*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ metrics: [] }),
    });
  });

  // Mock marketplace endpoints used by detail modal sub-components
  await page.route('**/api/marketplace/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
  });
}

test.describe('Plugin Management - List', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
    await page.goto('/plugins');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Plugin Marketplace')).toBeVisible({ timeout: 10000 });
  });

  test('should render plugin cards with correct data', async ({ page }) => {
    // All plugins should be visible
    await expect(page.locator('text=Analytics Pro')).toBeVisible();
    await expect(page.locator('text=CRM Integration')).toBeVisible();
    await expect(page.locator('text=Legacy Export')).toBeVisible();

    // Descriptions
    await expect(page.locator('text=Advanced analytics and reporting plugin')).toBeVisible();

    // Authors
    await expect(page.locator('text=By Plexica Team')).toBeVisible();
    await expect(page.locator('text=By Test Author')).toBeVisible();
  });

  test('should display status badges on plugin cards', async ({ page }) => {
    // Status badges should be visible
    await expect(page.locator('text=PUBLISHED').first()).toBeVisible();
    await expect(page.locator('text=DRAFT').first()).toBeVisible();
    await expect(page.locator('text=DEPRECATED').first()).toBeVisible();
  });

  test('should show plugin stats summary', async ({ page }) => {
    // Stats bar
    await expect(page.locator('text=total plugins')).toBeVisible();
    await expect(page.locator('text=published')).toBeVisible();
    await expect(page.locator('text=categories')).toBeVisible();
  });

  test('should filter plugins by search query', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Search plugins"]');
    await searchInput.fill('Analytics');

    // Only Analytics Pro should remain
    await expect(page.locator('h3:has-text("Analytics Pro")')).toBeVisible();
    // Others should be hidden
    await expect(page.locator('h3:has-text("CRM Integration")')).not.toBeVisible({ timeout: 2000 });
    await expect(page.locator('h3:has-text("Legacy Export")')).not.toBeVisible({ timeout: 2000 });
  });

  test('should filter plugins by status', async ({ page }) => {
    // Find status filter select (second select, after category might vary - use option text)
    const statusSelect = page
      .locator('select')
      .filter({ has: page.locator('option:has-text("Published")') });
    await statusSelect.selectOption('DRAFT');

    // Only DRAFT plugin should be visible
    await expect(page.locator('h3:has-text("CRM Integration")')).toBeVisible();
    await expect(page.locator('h3:has-text("Analytics Pro")')).not.toBeVisible({ timeout: 2000 });
  });

  test('should filter plugins by category', async ({ page }) => {
    // Find the category select
    const categorySelect = page
      .locator('select')
      .filter({ has: page.locator('option:has-text("All Categories")') });
    await categorySelect.selectOption('analytics');

    // Only analytics plugins should be visible
    await expect(page.locator('h3:has-text("Analytics Pro")')).toBeVisible();
    await expect(page.locator('h3:has-text("CRM Integration")')).not.toBeVisible({ timeout: 2000 });
  });

  test('should show clear filters button when filters active', async ({ page }) => {
    await expect(page.locator('button:has-text("Clear filters")')).not.toBeVisible();

    const searchInput = page.locator('input[placeholder*="Search plugins"]');
    await searchInput.fill('test');

    await expect(page.locator('button:has-text("Clear filters")')).toBeVisible();

    await page.locator('button:has-text("Clear filters")').click();

    // All plugins visible again
    await expect(page.locator('h3:has-text("Analytics Pro")')).toBeVisible();
    await expect(page.locator('h3:has-text("CRM Integration")')).toBeVisible();
    await expect(page.locator('h3:has-text("Legacy Export")')).toBeVisible();
  });

  test('should show Marketplace and Review Queue tabs', async ({ page }) => {
    await expect(page.locator('button:has-text("Marketplace")')).toBeVisible();
    await expect(page.locator('button:has-text("Review Queue")')).toBeVisible();
  });

  test('should have Publish Plugin button', async ({ page }) => {
    await expect(page.locator('button:has-text("Publish Plugin")')).toBeVisible();
  });
});

test.describe('Plugin Management - Detail Modal', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
    await page.goto('/plugins');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Plugin Marketplace')).toBeVisible({ timeout: 10000 });
  });

  test('should open plugin detail modal when clicking plugin name', async ({ page }) => {
    // Click on plugin name
    await page.locator('h3:has-text("Analytics Pro")').click();

    // Modal should open
    await expect(page.locator('h2:has-text("Analytics Pro")')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=v2.1.0')).toBeVisible();
  });

  test('should open plugin detail modal when clicking View button', async ({ page }) => {
    // Find the Analytics Pro card and click View
    const card = page
      .locator('[class*="card"]', { has: page.locator('h3:has-text("Analytics Pro")') })
      .first();
    await card.locator('button:has-text("View")').click();

    await expect(page.locator('h2:has-text("Analytics Pro")')).toBeVisible({ timeout: 5000 });
  });

  test('should display plugin statistics in detail modal', async ({ page }) => {
    await page.locator('h3:has-text("Analytics Pro")').click();
    await expect(page.locator('h2:has-text("Analytics Pro")')).toBeVisible({ timeout: 5000 });

    // Statistics section
    await expect(page.locator('text=Installs')).toBeVisible();
    await expect(page.locator('text=Rating')).toBeVisible();
    await expect(page.locator('text=Reviews')).toBeVisible();

    // Values from mock data
    await expect(page.locator('text=15')).toBeVisible(); // installCount
    await expect(page.locator('text=4.5/5')).toBeVisible(); // averageRating
    await expect(page.locator('text=8')).toBeVisible(); // ratingCount
  });

  test('should show Deprecate button for PUBLISHED plugins', async ({ page }) => {
    await page.locator('h3:has-text("Analytics Pro")').click();
    await expect(page.locator('h2:has-text("Analytics Pro")')).toBeVisible({ timeout: 5000 });

    await expect(page.locator('button:has-text("Deprecate")')).toBeVisible();
    // Should NOT show Delete for PUBLISHED
    await expect(page.locator('button:has-text("Delete Plugin")')).not.toBeVisible();
  });

  test('should show Delete button for DRAFT plugins', async ({ page }) => {
    await page.locator('h3:has-text("CRM Integration")').click();
    await expect(page.locator('h2:has-text("CRM Integration")')).toBeVisible({ timeout: 5000 });

    await expect(page.locator('button:has-text("Delete Plugin")')).toBeVisible();
    // Should NOT show Deprecate for DRAFT
    await expect(page.locator('button:has-text("Deprecate")')).not.toBeVisible();
  });

  test('should show Delete button for DEPRECATED plugins', async ({ page }) => {
    await page.locator('h3:has-text("Legacy Export")').click();
    await expect(page.locator('h2:has-text("Legacy Export")')).toBeVisible({ timeout: 5000 });

    await expect(page.locator('button:has-text("Delete Plugin")')).toBeVisible();
    await expect(page.locator('button:has-text("Deprecate")')).not.toBeVisible();
  });

  test('should show plugin description in detail modal', async ({ page }) => {
    await page.locator('h3:has-text("Analytics Pro")').click();
    await expect(page.locator('h2:has-text("Analytics Pro")')).toBeVisible({ timeout: 5000 });

    await expect(page.locator('text=Advanced analytics and reporting plugin')).toBeVisible();
  });

  test('should show plugin basic info in detail modal', async ({ page }) => {
    await page.locator('h3:has-text("Analytics Pro")').click();
    await expect(page.locator('h2:has-text("Analytics Pro")')).toBeVisible({ timeout: 5000 });

    // Plugin ID
    await expect(page.locator('text=plugin-1')).toBeVisible();
    // Author
    await expect(page.locator('text=Plexica Team')).toBeVisible();
    // Category
    await expect(page.locator('text=analytics')).toBeVisible();
  });

  test('should show Manage Versions and View Analytics buttons', async ({ page }) => {
    await page.locator('h3:has-text("Analytics Pro")').click();
    await expect(page.locator('h2:has-text("Analytics Pro")')).toBeVisible({ timeout: 5000 });

    await expect(page.locator('button:has-text("Manage Versions")')).toBeVisible();
    await expect(page.locator('button:has-text("View Analytics")')).toBeVisible();
  });

  test('should close detail modal with Close button', async ({ page }) => {
    await page.locator('h3:has-text("Analytics Pro")').click();
    await expect(page.locator('h2:has-text("Analytics Pro")')).toBeVisible({ timeout: 5000 });

    await page.locator('button:has-text("Close")').click();

    await expect(page.locator('h2:has-text("Analytics Pro")')).not.toBeVisible({ timeout: 3000 });
  });
});
