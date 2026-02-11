/**
 * Navigation & Dashboard E2E Tests
 *
 * Tests sidebar navigation, dashboard rendering,
 * and basic page accessibility for the super-admin app.
 */

import { test, expect, Page } from '@playwright/test';
import { mockAllApis, MockTenant, MockPlugin, MockUser } from './helpers/api-mocks';

const MOCK_TENANTS: MockTenant[] = [
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
];

const MOCK_PLUGINS: MockPlugin[] = [
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
];

const MOCK_USERS: MockUser[] = [
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
];

/**
 * Setup API mocks for all admin endpoints
 */
async function setupApiMocks(page: Page) {
  await mockAllApis(page, {
    tenants: MOCK_TENANTS,
    plugins: MOCK_PLUGINS,
    users: MOCK_USERS,
    overview: {
      totalTenants: 5,
      activeTenants: 3,
      suspendedTenants: 1,
      provisioningTenants: 1,
      totalPlugins: 12,
      totalPluginInstallations: 47,
      totalUsers: 25,
      totalWorkspaces: 8,
    },
    tenantGrowth: [
      { date: '2026-02-04', totalTenants: 3, activeTenants: 2, newTenants: 0 },
      { date: '2026-02-05', totalTenants: 3, activeTenants: 2, newTenants: 0 },
      { date: '2026-02-06', totalTenants: 4, activeTenants: 3, newTenants: 1 },
      { date: '2026-02-07', totalTenants: 5, activeTenants: 3, newTenants: 1 },
    ],
    pluginUsage: [
      {
        pluginId: 'plugin-1',
        pluginName: 'Analytics Pro',
        installCount: 15,
        activeInstalls: 3,
      },
    ],
    apiCalls: [
      {
        date: '2026-02-10T00:00:00Z',
        totalCalls: 450,
        errorCalls: 5,
        avgLatencyMs: 42,
      },
      {
        date: '2026-02-10T04:00:00Z',
        totalCalls: 320,
        errorCalls: 2,
        avgLatencyMs: 38,
      },
    ],
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
    await expect(page.locator('text=Platform Dashboard')).toBeVisible({ timeout: 10000 });
  });

  test('should display sidebar with all navigation links', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Wait for app to load
    await expect(page.locator('text=Platform Dashboard')).toBeVisible({ timeout: 10000 });

    // Check sidebar links (use .first() since stat cards also link to these URLs)
    await expect(page.locator('a[href="/"]').filter({ hasText: 'Dashboard' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Tenants', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Plugins', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Users', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Analytics', exact: true })).toBeVisible();
  });

  test('should navigate to tenants page via sidebar', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Platform Dashboard')).toBeVisible({ timeout: 10000 });

    await page.getByRole('link', { name: 'Tenants', exact: true }).click();
    await page.waitForURL('**/tenants');

    await expect(page.locator('text=Tenant Management')).toBeVisible({ timeout: 5000 });
  });

  test('should navigate to plugins page via sidebar', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Platform Dashboard')).toBeVisible({ timeout: 10000 });

    await page.getByRole('link', { name: 'Plugins', exact: true }).click();
    await page.waitForURL('**/plugins');

    await expect(page.locator('text=Plugin Marketplace')).toBeVisible({ timeout: 5000 });
  });

  test('should navigate to users page via sidebar', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Platform Dashboard')).toBeVisible({ timeout: 10000 });

    await page.getByRole('link', { name: 'Users', exact: true }).click();
    await page.waitForURL('**/users');

    await expect(page.locator('text=Platform Users')).toBeVisible({ timeout: 5000 });
  });

  test('should navigate to analytics page via sidebar', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Platform Dashboard')).toBeVisible({ timeout: 10000 });

    await page.getByRole('link', { name: 'Analytics', exact: true }).click();
    await page.waitForURL('**/analytics');

    await expect(page.locator('text=Platform Analytics')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Platform Dashboard')).toBeVisible({ timeout: 10000 });
  });

  test('should display overview statistics from API', async ({ page }) => {
    // Stat cards should show data from mocked analytics overview
    await expect(page.locator('text=Total Tenants')).toBeVisible();
    await expect(page.locator('text=Active Tenants')).toBeVisible();
    await expect(page.locator('text=Total Users')).toBeVisible();
    await expect(page.locator('text=Available Plugins')).toBeVisible();
  });

  test('should display quick action cards', async ({ page }) => {
    // Quick action cards link to sub-pages
    await expect(page.locator('text=Go to Tenants →')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Go to Plugins →')).toBeVisible();
    await expect(page.locator('text=Go to Users →')).toBeVisible();
    await expect(page.locator('text=Go to Analytics →')).toBeVisible();
  });
});
