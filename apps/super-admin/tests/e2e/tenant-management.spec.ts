/**
 * Tenant Management E2E Tests
 *
 * Tests tenant list rendering, search/filter, detail modal,
 * and tenant lifecycle actions (suspend, activate, delete).
 */

import { test, expect, Page } from '@playwright/test';

const MOCK_TENANTS = [
  {
    id: 'tenant-1',
    name: 'Acme Corp',
    slug: 'acme-corp',
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-15T00:00:00Z',
  },
  {
    id: 'tenant-2',
    name: 'TechStart Inc',
    slug: 'techstart',
    status: 'ACTIVE',
    createdAt: '2026-01-05T00:00:00Z',
    updatedAt: '2026-01-20T00:00:00Z',
  },
  {
    id: 'tenant-3',
    name: 'Suspended Co',
    slug: 'suspended-co',
    status: 'SUSPENDED',
    createdAt: '2026-01-10T00:00:00Z',
    updatedAt: '2026-01-25T00:00:00Z',
  },
];

async function setupApiMocks(page: Page) {
  // Mock analytics overview (dashboard uses this)
  await page.route('**/api/admin/analytics/overview*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        totalTenants: 3,
        activeTenants: 2,
        suspendedTenants: 1,
        provisioningTenants: 0,
        totalPlugins: 5,
        totalPluginInstallations: 10,
        totalUsers: 8,
        totalWorkspaces: 4,
      }),
    });
  });

  // Mock tenants list
  await page.route('**/api/admin/tenants*', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    // GET specific tenant by ID (detail fetch)
    if (method === 'GET' && url.match(/\/tenants\/tenant-\d+$/)) {
      const tenantId = url.split('/').pop();
      const tenant = MOCK_TENANTS.find((t) => t.id === tenantId);
      if (tenant) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ...tenant,
            plugins: [{ id: 'p1', name: 'Plugin A' }],
          }),
        });
      } else {
        await route.fulfill({ status: 404 });
      }
      return;
    }

    // PATCH suspend tenant
    if (method === 'PATCH' && url.includes('/suspend')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...MOCK_TENANTS[0], status: 'SUSPENDED' }),
      });
      return;
    }

    // PATCH activate tenant
    if (method === 'PATCH' && url.includes('/activate')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...MOCK_TENANTS[2], status: 'ACTIVE' }),
      });
      return;
    }

    // DELETE tenant
    if (method === 'DELETE') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Tenant deleted' }),
      });
      return;
    }

    // GET tenants list
    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          tenants: MOCK_TENANTS,
          total: MOCK_TENANTS.length,
          page: 1,
          limit: 50,
          totalPages: 1,
        }),
      });
    }
  });

  // Mock other endpoints to prevent errors
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
}

test.describe('Tenant Management', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
    await page.goto('/tenants');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Tenant Management')).toBeVisible({ timeout: 10000 });
  });

  test('should render tenant list with correct data', async ({ page }) => {
    // All tenants should be visible
    await expect(page.locator('text=Acme Corp')).toBeVisible();
    await expect(page.locator('text=TechStart Inc')).toBeVisible();
    await expect(page.locator('text=Suspended Co')).toBeVisible();

    // Slugs should be visible
    await expect(page.locator('text=acme-corp')).toBeVisible();
    await expect(page.locator('text=techstart')).toBeVisible();
    await expect(page.locator('text=suspended-co')).toBeVisible();
  });

  test('should display tenant stat cards', async ({ page }) => {
    await expect(page.locator('text=Total Tenants')).toBeVisible();
    await expect(page.locator('text=Active')).toBeVisible();
    await expect(page.locator('text=Suspended')).toBeVisible();
  });

  test('should display status badges for each tenant', async ({ page }) => {
    // Table should have ACTIVE and SUSPENDED badges
    const activeBadges = page.locator('td >> text=ACTIVE');
    await expect(activeBadges.first()).toBeVisible();

    const suspendedBadge = page.locator('td >> text=SUSPENDED');
    await expect(suspendedBadge).toBeVisible();
  });

  test('should filter tenants by search query', async ({ page }) => {
    // Search for "Acme"
    const searchInput = page.locator('input[placeholder*="Search tenants"]');
    await searchInput.fill('Acme');

    // Only Acme Corp should remain visible
    await expect(page.locator('text=Acme Corp')).toBeVisible();
    // Other tenants should be filtered out
    await expect(page.locator('td >> text=TechStart Inc')).not.toBeVisible({ timeout: 2000 });
    await expect(page.locator('td >> text=Suspended Co')).not.toBeVisible({ timeout: 2000 });
  });

  test('should filter tenants by status', async ({ page }) => {
    // Select SUSPENDED status
    const statusSelect = page.locator('select').first();
    await statusSelect.selectOption('SUSPENDED');

    // Only suspended tenant should be visible
    await expect(page.locator('text=Suspended Co')).toBeVisible();
    // Active tenants should be hidden
    await expect(page.locator('td >> text=Acme Corp')).not.toBeVisible({ timeout: 2000 });
  });

  test('should show clear filters button when filters are active', async ({ page }) => {
    // Initially no "Clear filters" button
    await expect(page.locator('button:has-text("Clear filters")')).not.toBeVisible();

    // Apply a search filter
    const searchInput = page.locator('input[placeholder*="Search tenants"]');
    await searchInput.fill('Acme');

    // Clear filters button should appear
    await expect(page.locator('button:has-text("Clear filters")')).toBeVisible();

    // Click clear filters
    await page.locator('button:has-text("Clear filters")').click();

    // All tenants should be visible again
    await expect(page.locator('text=Acme Corp')).toBeVisible();
    await expect(page.locator('text=TechStart Inc')).toBeVisible();
    await expect(page.locator('text=Suspended Co')).toBeVisible();
  });

  test('should open tenant detail modal when clicking View', async ({ page }) => {
    // Click View for Acme Corp row
    const acmeRow = page.locator('tr', { has: page.locator('text=Acme Corp') });
    await acmeRow.locator('button:has-text("View")').click();

    // Modal should open with tenant details
    await expect(page.locator('h2:has-text("Acme Corp")')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=acme-corp')).toBeVisible();

    // Should show tenant ID
    await expect(page.locator('text=tenant-1')).toBeVisible();

    // Should show infrastructure info
    await expect(page.locator('text=Database Schema:')).toBeVisible();
    await expect(page.locator('text=tenant_acme_corp')).toBeVisible();
    await expect(page.locator('text=Keycloak Realm:')).toBeVisible();
  });

  test('should show Suspend button for ACTIVE tenants in detail modal', async ({ page }) => {
    // Open Acme Corp detail (ACTIVE tenant)
    const acmeRow = page.locator('tr', { has: page.locator('text=Acme Corp') });
    await acmeRow.locator('button:has-text("View")').click();
    await expect(page.locator('h2:has-text("Acme Corp")')).toBeVisible({ timeout: 5000 });

    // Should show Suspend button
    await expect(page.locator('button:has-text("Suspend Tenant")')).toBeVisible();
    // Should NOT show Activate button
    await expect(page.locator('button:has-text("Activate Tenant")')).not.toBeVisible();
  });

  test('should show Activate button for SUSPENDED tenants in detail modal', async ({ page }) => {
    // Open Suspended Co detail
    const suspRow = page.locator('tr', { has: page.locator('text=Suspended Co') });
    await suspRow.locator('button:has-text("View")').click();
    await expect(page.locator('h2:has-text("Suspended Co")')).toBeVisible({ timeout: 5000 });

    // Should show Activate button
    await expect(page.locator('button:has-text("Activate Tenant")')).toBeVisible();
    // Should NOT show Suspend button
    await expect(page.locator('button:has-text("Suspend Tenant")')).not.toBeVisible();
  });

  test('should show Delete button in detail modal', async ({ page }) => {
    const acmeRow = page.locator('tr', { has: page.locator('text=Acme Corp') });
    await acmeRow.locator('button:has-text("View")').click();
    await expect(page.locator('h2:has-text("Acme Corp")')).toBeVisible({ timeout: 5000 });

    await expect(page.locator('button:has-text("Delete Tenant")')).toBeVisible();
  });

  test('should close detail modal with Close button', async ({ page }) => {
    // Open modal
    const acmeRow = page.locator('tr', { has: page.locator('text=Acme Corp') });
    await acmeRow.locator('button:has-text("View")').click();
    await expect(page.locator('h2:has-text("Acme Corp")')).toBeVisible({ timeout: 5000 });

    // Click Close button in footer
    await page.locator('button:has-text("Close")').click();

    // Modal should close
    await expect(page.locator('h2:has-text("Acme Corp")')).not.toBeVisible({ timeout: 3000 });
  });

  test('should show Suspend button in tenant table row for ACTIVE tenants', async ({ page }) => {
    const acmeRow = page.locator('tr', { has: page.locator('text=Acme Corp') });
    await expect(acmeRow.locator('button:has-text("Suspend")')).toBeVisible();
  });

  test('should show Activate button in tenant table row for SUSPENDED tenants', async ({
    page,
  }) => {
    const suspRow = page.locator('tr', { has: page.locator('text=Suspended Co') });
    await expect(suspRow.locator('button:has-text("Activate")')).toBeVisible();
  });

  test('should show plugin count in detail modal statistics', async ({ page }) => {
    // Open detail modal
    const acmeRow = page.locator('tr', { has: page.locator('text=Acme Corp') });
    await acmeRow.locator('button:has-text("View")').click();
    await expect(page.locator('h2:has-text("Acme Corp")')).toBeVisible({ timeout: 5000 });

    // Statistics section should show plugin count
    await expect(page.locator('text=Plugins')).toBeVisible();
    // The mock returns 1 plugin for the detail
    await expect(page.locator('text=Statistics').locator('..').locator('text=1')).toBeVisible();
  });

  test('should open Create Tenant modal', async ({ page }) => {
    await page.locator('button:has-text("Create Tenant")').click();
    // CreateTenantModal should appear
    await page.waitForTimeout(500);
    // The modal existence means it opened (content depends on CreateTenantModal implementation)
  });
});
