/**
 * Navigation & Dashboard E2E Tests
 *
 * Tests sidebar navigation, dashboard rendering,
 * and basic page accessibility for the super-admin app.
 */

import { test, expect, Page } from '@playwright/test';

/**
 * Setup API mocks for all admin endpoints
 */
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

  // Mock tenants list
  await page.route('**/api/admin/tenants*', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          tenants: [
            {
              id: 'tenant-1',
              name: 'Acme Corp',
              slug: 'acme-corp',
              status: 'ACTIVE',
              createdAt: '2026-01-01T00:00:00Z',
            },
            {
              id: 'tenant-2',
              name: 'TechStart Inc',
              slug: 'techstart',
              status: 'ACTIVE',
              createdAt: '2026-01-05T00:00:00Z',
            },
            {
              id: 'tenant-3',
              name: 'Suspended Co',
              slug: 'suspended-co',
              status: 'SUSPENDED',
              createdAt: '2026-01-10T00:00:00Z',
            },
          ],
          total: 3,
          page: 1,
          limit: 50,
          totalPages: 1,
        }),
      });
    }
  });

  // Mock plugins list
  await page.route('**/api/admin/plugins*', async (route) => {
    if (route.request().method() === 'GET' && !route.request().url().includes('/analytics')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            {
              id: 'plugin-1',
              name: 'Analytics Pro',
              version: '2.1.0',
              status: 'PUBLISHED',
              description: 'Advanced analytics plugin',
              category: 'analytics',
              author: 'Plexica Team',
              averageRating: 4.5,
              installCount: 15,
              createdAt: '2026-01-01T00:00:00Z',
            },
            {
              id: 'plugin-2',
              name: 'CRM Integration',
              version: '1.0.0',
              status: 'DRAFT',
              description: 'CRM integration plugin',
              category: 'crm',
              author: 'Test Author',
              averageRating: 0,
              installCount: 0,
              createdAt: '2026-01-10T00:00:00Z',
            },
          ],
          pagination: {
            page: 1,
            limit: 50,
            total: 2,
            totalPages: 1,
          },
        }),
      });
    }
  });

  // Mock users list
  await page.route('**/api/admin/users*', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          users: [
            {
              id: 'user-1',
              email: 'alice@acme.com',
              name: 'Alice Johnson',
              firstName: 'Alice',
              lastName: 'Johnson',
              tenantId: 'tenant-1',
              tenantName: 'Acme Corp',
              tenantSlug: 'acme-corp',
              roles: ['admin'],
              createdAt: '2026-01-02T00:00:00Z',
            },
            {
              id: 'user-2',
              email: 'bob@techstart.com',
              name: 'Bob Smith',
              firstName: 'Bob',
              lastName: 'Smith',
              tenantId: 'tenant-2',
              tenantName: 'TechStart Inc',
              tenantSlug: 'techstart',
              roles: ['member'],
              createdAt: '2026-01-06T00:00:00Z',
            },
          ],
          total: 2,
          page: 1,
          limit: 50,
          totalPages: 1,
        }),
      });
    }
  });

  // Mock analytics endpoints
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
        ],
      }),
    });
  });

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
        ],
        note: 'API metrics collection not yet implemented - showing placeholder data',
      }),
    });
  });
}

test.describe('Navigation & Layout', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
  });

  test('should load the dashboard on root URL', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Dashboard heading should be visible
    await expect(page.locator('text=Platform Overview')).toBeVisible({ timeout: 10000 });
  });

  test('should display sidebar with all navigation links', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Wait for app to load
    await expect(page.locator('text=Platform Overview')).toBeVisible({ timeout: 10000 });

    // Check sidebar links
    await expect(page.locator('a[href="/"]').filter({ hasText: 'Dashboard' })).toBeVisible();
    await expect(page.locator('a[href="/tenants"]')).toBeVisible();
    await expect(page.locator('a[href="/plugins"]')).toBeVisible();
    await expect(page.locator('a[href="/users"]')).toBeVisible();
    await expect(page.locator('a[href="/analytics"]')).toBeVisible();
  });

  test('should navigate to tenants page via sidebar', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Platform Overview')).toBeVisible({ timeout: 10000 });

    await page.locator('a[href="/tenants"]').click();
    await page.waitForURL('**/tenants');

    await expect(page.locator('text=Tenant Management')).toBeVisible({ timeout: 5000 });
  });

  test('should navigate to plugins page via sidebar', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Platform Overview')).toBeVisible({ timeout: 10000 });

    await page.locator('a[href="/plugins"]').click();
    await page.waitForURL('**/plugins');

    await expect(page.locator('text=Plugin Marketplace')).toBeVisible({ timeout: 5000 });
  });

  test('should navigate to users page via sidebar', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Platform Overview')).toBeVisible({ timeout: 10000 });

    await page.locator('a[href="/users"]').click();
    await page.waitForURL('**/users');

    await expect(page.locator('text=User Management')).toBeVisible({ timeout: 5000 });
  });

  test('should navigate to analytics page via sidebar', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Platform Overview')).toBeVisible({ timeout: 10000 });

    await page.locator('a[href="/analytics"]').click();
    await page.waitForURL('**/analytics');

    await expect(page.locator('text=Platform Analytics')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Platform Overview')).toBeVisible({ timeout: 10000 });
  });

  test('should display overview statistics from API', async ({ page }) => {
    // Stat cards should show data from mocked analytics overview
    await expect(page.locator('text=Total Tenants')).toBeVisible();
    await expect(page.locator('text=Active Tenants')).toBeVisible();
    await expect(page.locator('text=Total Users')).toBeVisible();
    await expect(page.locator('text=Total Plugins')).toBeVisible();
  });

  test('should display recent tenants section', async ({ page }) => {
    // Recent tenants from mocked data
    await expect(page.locator('text=Acme Corp')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=TechStart Inc')).toBeVisible();
  });
});
