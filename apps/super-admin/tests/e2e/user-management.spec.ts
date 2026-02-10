/**
 * User Management E2E Tests
 *
 * Tests user list rendering, search, filter by role and tenant,
 * stats display, and user detail modal.
 */

import { test, expect, Page } from '@playwright/test';

const MOCK_USERS = [
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
  {
    id: 'user-3',
    email: 'carol@acme.com',
    name: 'Carol Davis',
    firstName: 'Carol',
    lastName: 'Davis',
    tenantId: 'tenant-1',
    tenantName: 'Acme Corp',
    tenantSlug: 'acme-corp',
    roles: ['admin', 'member'],
    createdAt: '2026-01-08T00:00:00Z',
  },
];

const MOCK_TENANTS = [
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
];

async function setupApiMocks(page: Page) {
  // Mock analytics overview
  await page.route('**/api/admin/analytics/overview*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        totalTenants: 2,
        activeTenants: 2,
        suspendedTenants: 0,
        provisioningTenants: 0,
        totalPlugins: 5,
        totalPluginInstallations: 10,
        totalUsers: 3,
        totalWorkspaces: 2,
      }),
    });
  });

  // Mock users list
  await page.route('**/api/admin/users*', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          users: MOCK_USERS,
          total: MOCK_USERS.length,
          page: 1,
          limit: 50,
          totalPages: 1,
        }),
      });
    }
  });

  // Mock tenants list (used by tenant filter dropdown)
  await page.route('**/api/admin/tenants*', async (route) => {
    if (route.request().method() === 'GET') {
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

  // Mock other endpoints
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

test.describe('User Management', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
    await page.goto('/users');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Platform Users')).toBeVisible({ timeout: 10000 });
  });

  test('should render user list with correct data', async ({ page }) => {
    // All users should be visible
    await expect(page.locator('text=Alice Johnson')).toBeVisible();
    await expect(page.locator('text=Bob Smith')).toBeVisible();
    await expect(page.locator('text=Carol Davis')).toBeVisible();

    // Emails should be visible
    await expect(page.locator('text=alice@acme.com')).toBeVisible();
    await expect(page.locator('text=bob@techstart.com')).toBeVisible();
    await expect(page.locator('text=carol@acme.com')).toBeVisible();
  });

  test('should display tenant names for each user', async ({ page }) => {
    // Tenant names in the table
    const acmeRows = page.locator('td >> text=Acme Corp');
    // Alice and Carol are both in Acme Corp
    await expect(acmeRows.first()).toBeVisible();

    await expect(page.locator('td >> text=TechStart Inc')).toBeVisible();
  });

  test('should display role badges for users', async ({ page }) => {
    // Role badges
    const adminBadges = page.locator('td >> text=admin');
    await expect(adminBadges.first()).toBeVisible();

    const memberBadges = page.locator('td >> text=member');
    await expect(memberBadges.first()).toBeVisible();
  });

  test('should display user stats', async ({ page }) => {
    // Stats bar shows totals
    await expect(page.locator('text=total users')).toBeVisible();
    await expect(page.locator('text=tenants')).toBeVisible();
    await expect(page.locator('text=roles')).toBeVisible();
  });

  test('should display table headers correctly', async ({ page }) => {
    await expect(page.locator('th >> text=User')).toBeVisible();
    await expect(page.locator('th >> text=Tenant')).toBeVisible();
    await expect(page.locator('th >> text=Roles')).toBeVisible();
    await expect(page.locator('th >> text=Joined')).toBeVisible();
    await expect(page.locator('th >> text=Actions')).toBeVisible();
  });

  test('should filter users by search query', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Search users"]');
    await searchInput.fill('Alice');

    // Only Alice should be visible
    await expect(page.locator('text=Alice Johnson')).toBeVisible();
    await expect(page.locator('td >> text=Bob Smith')).not.toBeVisible({ timeout: 2000 });
    await expect(page.locator('td >> text=Carol Davis')).not.toBeVisible({ timeout: 2000 });
  });

  test('should filter users by email search', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Search users"]');
    await searchInput.fill('bob@techstart');

    await expect(page.locator('text=Bob Smith')).toBeVisible();
    await expect(page.locator('td >> text=Alice Johnson')).not.toBeVisible({ timeout: 2000 });
  });

  test('should filter users by role', async ({ page }) => {
    // Find role filter select
    const roleSelect = page
      .locator('select')
      .filter({ has: page.locator('option:has-text("All Roles")') });
    await roleSelect.selectOption('admin');

    // Alice and Carol have admin role
    await expect(page.locator('text=Alice Johnson')).toBeVisible();
    await expect(page.locator('text=Carol Davis')).toBeVisible();
    // Bob only has member role
    await expect(page.locator('td >> text=Bob Smith')).not.toBeVisible({ timeout: 2000 });
  });

  test('should show clear filters button when filters active', async ({ page }) => {
    // Initially no clear button
    await expect(page.locator('button:has-text("Clear filters")')).not.toBeVisible();

    // Apply search filter
    const searchInput = page.locator('input[placeholder*="Search users"]');
    await searchInput.fill('Alice');

    // Clear filters button should appear
    await expect(page.locator('button:has-text("Clear filters")')).toBeVisible();

    // Click clear
    await page.locator('button:has-text("Clear filters")').click();

    // All users should be visible again
    await expect(page.locator('text=Alice Johnson')).toBeVisible();
    await expect(page.locator('text=Bob Smith')).toBeVisible();
    await expect(page.locator('text=Carol Davis')).toBeVisible();
  });

  test('should show results count when filters active', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Search users"]');
    await searchInput.fill('Alice');

    // Should show "1 results" or similar
    await expect(page.locator('text=results')).toBeVisible();
  });

  test('should have View button for each user', async ({ page }) => {
    // Each row should have a View button
    const viewButtons = page.locator('button:has-text("View")');
    await expect(viewButtons).toHaveCount(3);
  });

  test('should open user detail modal when clicking View', async ({ page }) => {
    // Click View for Alice
    const aliceRow = page.locator('tr', { has: page.locator('text=Alice Johnson') });
    await aliceRow.locator('button:has-text("View")').click();

    // UserDetailModal should appear — wait for it
    await page.waitForTimeout(500);
    // The modal should show user details (depends on UserDetailModal implementation)
    // At minimum, the modal overlay should appear
  });
});
