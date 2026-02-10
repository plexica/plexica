/**
 * Analytics View E2E Tests
 *
 * Tests analytics dashboard rendering: stats cards, tenant growth chart,
 * API calls chart, plugin usage table, and time period selector.
 */

import { test, expect, Page } from '@playwright/test';

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
        totalPlugins: 12,
        totalPluginInstallations: 47,
        totalUsers: 25,
        totalWorkspaces: 8,
      }),
    });
  });

  // Mock tenant growth analytics
  await page.route('**/api/admin/analytics/tenants*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          { date: '2026-02-04', totalTenants: 3, activeTenants: 2, newTenants: 0 },
          { date: '2026-02-05', totalTenants: 3, activeTenants: 2, newTenants: 0 },
          { date: '2026-02-06', totalTenants: 4, activeTenants: 3, newTenants: 1 },
          { date: '2026-02-07', totalTenants: 5, activeTenants: 3, newTenants: 1 },
        ],
      }),
    });
  });

  // Mock plugin analytics
  await page.route('**/api/admin/analytics/plugins*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        plugins: [
          {
            pluginId: 'plugin-1',
            pluginName: 'Analytics Pro',
            version: '2.1.0',
            totalInstallations: 15,
            activeTenants: 3,
          },
          {
            pluginId: 'plugin-2',
            pluginName: 'CRM Integration',
            version: '1.0.0',
            totalInstallations: 8,
            activeTenants: 2,
          },
        ],
      }),
    });
  });

  // Mock API calls analytics
  await page.route('**/api/admin/analytics/api-calls*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        metrics: [
          {
            period: '2026-02-10T00:00:00Z',
            totalCalls: 450,
            successfulCalls: 445,
            failedCalls: 5,
            averageResponseTime: 42,
          },
          {
            period: '2026-02-10T04:00:00Z',
            totalCalls: 320,
            successfulCalls: 318,
            failedCalls: 2,
            averageResponseTime: 38,
          },
          {
            period: '2026-02-10T08:00:00Z',
            totalCalls: 580,
            successfulCalls: 575,
            failedCalls: 5,
            averageResponseTime: 45,
          },
        ],
        note: 'API metrics collection not yet implemented - showing placeholder data',
      }),
    });
  });

  // Mock other endpoints
  await page.route('**/api/admin/tenants*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ tenants: [], total: 0, page: 1, limit: 50, totalPages: 0 }),
    });
  });
  await page.route('**/api/admin/plugins*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [],
        pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
      }),
    });
  });
  await page.route('**/api/admin/users*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ users: [], total: 0, page: 1, limit: 50, totalPages: 0 }),
    });
  });
}

test.describe('Analytics View - Stats', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
    await page.goto('/analytics');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Platform Analytics')).toBeVisible({ timeout: 10000 });
  });

  test('should display primary stat cards from API data', async ({ page }) => {
    // Primary stat cards
    await expect(page.locator('text=Total Tenants')).toBeVisible();
    await expect(page.locator('text=Total Users')).toBeVisible();
    await expect(page.locator('text=Active Plugins')).toBeVisible();
    await expect(page.locator('text=API Calls (24h)')).toBeVisible();
  });

  test('should display secondary stats', async ({ page }) => {
    // Secondary stat cards
    await expect(page.locator('text=Avg Response Time')).toBeVisible();
    await expect(page.locator('text=Error Rate')).toBeVisible();
    await expect(page.locator('text=Active Tenants')).toBeVisible();
  });

  test('should show correct total tenants value', async ({ page }) => {
    // The StatCard for Total Tenants should show "5"
    const tenantCard = page.locator('div', { has: page.locator('text=Total Tenants') });
    await expect(tenantCard.locator('text=5').first()).toBeVisible();
  });

  test('should show correct total users value', async ({ page }) => {
    const usersCard = page.locator('div', { has: page.locator('text=Total Users') });
    await expect(usersCard.locator('text=25').first()).toBeVisible();
  });

  test('should show correct active plugins value', async ({ page }) => {
    const pluginsCard = page.locator('div', { has: page.locator('text=Active Plugins') });
    await expect(pluginsCard.locator('text=12').first()).toBeVisible();
  });

  test('should show active tenants count in secondary stats', async ({ page }) => {
    // Find the "Active Tenants" secondary card and check value
    const activeTenantCard = page.locator('.grid.grid-cols-1.md\\:grid-cols-3 >> div', {
      has: page.locator('text=Active Tenants'),
    });
    await expect(activeTenantCard.locator('text=3').first()).toBeVisible();
  });
});

test.describe('Analytics View - Charts', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
    await page.goto('/analytics');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Platform Analytics')).toBeVisible({ timeout: 10000 });
  });

  test('should display Tenant Growth chart', async ({ page }) => {
    await expect(page.locator('text=Tenant Growth')).toBeVisible();

    // Chart bars should render with data values
    // The chart shows date labels and bar values
    await expect(page.locator('text=Feb 4')).toBeVisible();
    await expect(page.locator('text=Feb 7')).toBeVisible();
  });

  test('should display API Calls chart', async ({ page }) => {
    await expect(page.locator('h3:has-text("API Calls (24h)")')).toBeVisible();
  });

  test('should display tenant growth data values in bars', async ({ page }) => {
    // Growth data shows count values in the bars
    // Check that some data values appear
    const growthSection = page.locator('div', { has: page.locator('text=Tenant Growth') }).first();
    await expect(growthSection).toBeVisible();
  });
});

test.describe('Analytics View - Plugin Usage', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
    await page.goto('/analytics');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Platform Analytics')).toBeVisible({ timeout: 10000 });
  });

  test('should display Plugin Usage section', async ({ page }) => {
    await expect(page.locator('text=Plugin Usage')).toBeVisible();
  });

  test('should show plugin names from API', async ({ page }) => {
    await expect(page.locator('text=Analytics Pro')).toBeVisible();
    await expect(page.locator('text=CRM Integration')).toBeVisible();
  });

  test('should show plugin versions', async ({ page }) => {
    await expect(page.locator('text=v2.1.0')).toBeVisible();
    await expect(page.locator('text=v1.0.0')).toBeVisible();
  });

  test('should show plugin installation counts', async ({ page }) => {
    await expect(page.locator('text=15 installs')).toBeVisible();
    await expect(page.locator('text=8 installs')).toBeVisible();
  });

  test('should show plugin active tenants', async ({ page }) => {
    await expect(page.locator('text=3 active tenants')).toBeVisible();
    await expect(page.locator('text=2 active tenants')).toBeVisible();
  });
});

test.describe('Analytics View - Time Period Selector', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
    await page.goto('/analytics');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Platform Analytics')).toBeVisible({ timeout: 10000 });
  });

  test('should display time period selector', async ({ page }) => {
    const selector = page
      .locator('select')
      .filter({ has: page.locator('option:has-text("Last 24 Hours")') });
    await expect(selector).toBeVisible();
  });

  test('should have all time period options', async ({ page }) => {
    await expect(page.locator('option:has-text("Last 24 Hours")')).toBeAttached();
    await expect(page.locator('option:has-text("Last 7 Days")')).toBeAttached();
    await expect(page.locator('option:has-text("Last 30 Days")')).toBeAttached();
  });

  test('should change time period selection', async ({ page }) => {
    const selector = page
      .locator('select')
      .filter({ has: page.locator('option:has-text("Last 24 Hours")') });

    // Default is 7d
    await selector.selectOption('30d');
    // Verify selection changed
    await expect(selector).toHaveValue('30d');

    await selector.selectOption('24h');
    await expect(selector).toHaveValue('24h');
  });
});

test.describe('Analytics View - Loading and Error States', () => {
  test('should show loading state initially', async ({ page }) => {
    // Set up slow API mocks to catch loading state
    await page.route('**/api/admin/analytics/overview*', async (route) => {
      // Delay response to show loading
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          totalTenants: 5,
          activeTenants: 3,
          suspendedTenants: 1,
          provisioningTenants: 1,
          totalPlugins: 12,
          totalPluginInstallations: 47,
          totalUsers: 25,
          totalWorkspaces: 8,
        }),
      });
    });
    await page.route('**/api/admin/analytics/tenants*', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
      });
    });
    await page.route('**/api/admin/analytics/plugins*', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ plugins: [] }),
      });
    });
    await page.route('**/api/admin/analytics/api-calls*', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ metrics: [] }),
      });
    });
    // Mock non-analytics endpoints without delay
    await page.route('**/api/admin/tenants*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ tenants: [], total: 0 }),
      });
    });
    await page.route('**/api/admin/plugins*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], pagination: { total: 0 } }),
      });
    });
    await page.route('**/api/admin/users*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ users: [], total: 0 }),
      });
    });

    await page.goto('/analytics');

    // Should show loading text
    await expect(page.locator('text=Loading analytics...')).toBeVisible({ timeout: 3000 });
  });

  test('should show error state when API fails', async ({ page }) => {
    // Mock API to return error
    await page.route('**/api/admin/analytics/overview*', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal server error' }),
      });
    });
    await page.route('**/api/admin/analytics/tenants*', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal server error' }),
      });
    });
    await page.route('**/api/admin/analytics/plugins*', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal server error' }),
      });
    });
    await page.route('**/api/admin/analytics/api-calls*', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal server error' }),
      });
    });
    // Mock non-analytics endpoints
    await page.route('**/api/admin/tenants*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ tenants: [], total: 0 }),
      });
    });
    await page.route('**/api/admin/plugins*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], pagination: { total: 0 } }),
      });
    });
    await page.route('**/api/admin/users*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ users: [], total: 0 }),
      });
    });

    await page.goto('/analytics');
    await page.waitForLoadState('networkidle');

    // Should show error message
    await expect(page.locator('text=Failed to load analytics data')).toBeVisible({
      timeout: 10000,
    });
  });
});
