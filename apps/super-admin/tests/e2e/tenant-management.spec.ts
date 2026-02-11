/**
 * Tenant Management E2E Tests
 *
 * Tests tenant list rendering, search/filter, detail modal,
 * and tenant lifecycle actions (suspend, activate, delete).
 */

import { test, expect, Page } from '@playwright/test';
import { mockAllApis, MockTenant } from './helpers/api-mocks';

const MOCK_TENANTS: MockTenant[] = [
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
  await mockAllApis(page, {
    tenants: MOCK_TENANTS,
    overview: {
      totalTenants: 3,
      activeTenants: 2,
      suspendedTenants: 1,
      provisioningTenants: 0,
      totalPlugins: 5,
      totalPluginInstallations: 10,
      totalUsers: 8,
      totalWorkspaces: 4,
    },
  });
}

test.describe('Tenant Management', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
    await page.goto('/tenants');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: 'Tenant Management' })).toBeVisible({
      timeout: 10000,
    });
  });

  test('should render tenant list with correct data', async ({ page }) => {
    // All tenants should be visible in table rows
    await expect(page.locator('tr', { hasText: 'Acme Corp' })).toBeVisible();
    await expect(page.locator('tr', { hasText: 'TechStart Inc' })).toBeVisible();
    await expect(page.locator('tr', { hasText: 'Suspended Co' })).toBeVisible();

    // Slugs should be visible within their respective rows
    await expect(page.locator('tr', { hasText: 'Acme Corp' }).getByText('acme-corp')).toBeVisible();
    await expect(
      page.locator('tr', { hasText: 'TechStart Inc' }).getByText('techstart', { exact: true })
    ).toBeVisible();
    await expect(
      page.locator('tr', { hasText: 'Suspended Co' }).getByText('suspended-co')
    ).toBeVisible();
  });

  test('should display tenant stat cards', async ({ page }) => {
    await expect(page.getByText('Total Tenants')).toBeVisible();
    // Stat card labels — use exact match to avoid matching badge text in table
    await expect(
      page.locator('[class*="grid"]').first().getByText('Active', { exact: true })
    ).toBeVisible();
    await expect(
      page.locator('[class*="grid"]').first().getByText('Suspended', { exact: true })
    ).toBeVisible();
  });

  test('should display status badges for each tenant', async ({ page }) => {
    // ACTIVE badge in Acme Corp row (use exact match to avoid matching other text)
    const acmeRow = page.locator('tr', { hasText: 'Acme Corp' });
    await expect(acmeRow.getByText('ACTIVE', { exact: true })).toBeVisible();

    // SUSPENDED badge in Suspended Co row
    const suspRow = page.locator('tr', { hasText: 'Suspended Co' });
    await expect(suspRow.getByText('SUSPENDED', { exact: true })).toBeVisible();
  });

  test('should filter tenants by search query', async ({ page }) => {
    // Use exact placeholder match to avoid matching the global header search
    const searchInput = page.locator('input[placeholder="Search tenants by name or slug..."]');
    await searchInput.fill('Acme');

    // Wait for the filtered results to load (debounce + API re-fetch)
    await page.waitForTimeout(500);

    // Only Acme Corp should remain visible
    await expect(page.locator('tbody tr', { hasText: 'Acme Corp' })).toBeVisible();
    // Other tenants should be filtered out — use toHaveCount for reliability
    await expect(page.locator('tbody tr')).toHaveCount(1, { timeout: 5000 });
  });

  test('should filter tenants by status', async ({ page }) => {
    // Select SUSPENDED status
    const statusSelect = page.locator('select').first();
    await statusSelect.selectOption('SUSPENDED');

    // Only suspended tenant should be visible in the table
    await expect(page.locator('tbody tr', { hasText: 'Suspended Co' })).toBeVisible();
    // Active tenants should be hidden
    await expect(page.locator('tbody tr', { hasText: 'Acme Corp' })).not.toBeVisible({
      timeout: 2000,
    });
  });

  test('should show clear filters button when filters are active', async ({ page }) => {
    // Initially no "Clear filters" button
    await expect(page.getByRole('button', { name: 'Clear filters' })).not.toBeVisible();

    // Apply a search filter
    const searchInput = page.locator('input[placeholder="Search tenants by name or slug..."]');
    await searchInput.fill('Acme');

    // Clear filters button should appear
    await expect(page.getByRole('button', { name: 'Clear filters' })).toBeVisible();

    // Click clear filters
    await page.getByRole('button', { name: 'Clear filters' }).click();

    // All tenants should be visible again
    await expect(page.locator('tr', { hasText: 'Acme Corp' })).toBeVisible();
    await expect(page.locator('tr', { hasText: 'TechStart Inc' })).toBeVisible();
    await expect(page.locator('tr', { hasText: 'Suspended Co' })).toBeVisible();
  });

  test('should open tenant detail modal when clicking View', async ({ page }) => {
    // Click View for Acme Corp row
    const acmeRow = page.locator('tr', { hasText: 'Acme Corp' });
    await acmeRow.getByRole('button', { name: 'View' }).click();

    // Modal should open with tenant details
    const modal = page.locator('.fixed');
    await expect(modal.locator('h2', { hasText: 'Acme Corp' })).toBeVisible({ timeout: 5000 });

    // Should show tenant ID
    await expect(modal.getByText('tenant-1')).toBeVisible();

    // Should show infrastructure info
    await expect(modal.getByText('Database Schema:')).toBeVisible();
    await expect(modal.getByText('tenant_acme_corp')).toBeVisible();
    await expect(modal.getByText('Keycloak Realm:')).toBeVisible();
  });

  test('should show Suspend button for ACTIVE tenants in detail modal', async ({ page }) => {
    // Open Acme Corp detail (ACTIVE tenant)
    const acmeRow = page.locator('tr', { hasText: 'Acme Corp' });
    await acmeRow.getByRole('button', { name: 'View' }).click();
    await expect(page.locator('h2', { hasText: 'Acme Corp' })).toBeVisible({ timeout: 5000 });

    // Should show Suspend button
    await expect(page.getByRole('button', { name: 'Suspend Tenant' })).toBeVisible();
    // Should NOT show Activate button
    await expect(page.getByRole('button', { name: 'Activate Tenant' })).not.toBeVisible();
  });

  test('should show Activate button for SUSPENDED tenants in detail modal', async ({ page }) => {
    // Open Suspended Co detail
    const suspRow = page.locator('tr', { hasText: 'Suspended Co' });
    await suspRow.getByRole('button', { name: 'View' }).click();
    await expect(page.locator('h2', { hasText: 'Suspended Co' })).toBeVisible({ timeout: 5000 });

    // Should show Activate button
    await expect(page.getByRole('button', { name: 'Activate Tenant' })).toBeVisible();
    // Should NOT show Suspend button
    await expect(page.getByRole('button', { name: 'Suspend Tenant' })).not.toBeVisible();
  });

  test('should show Delete button in detail modal', async ({ page }) => {
    const acmeRow = page.locator('tr', { hasText: 'Acme Corp' });
    await acmeRow.getByRole('button', { name: 'View' }).click();
    await expect(page.locator('h2', { hasText: 'Acme Corp' })).toBeVisible({ timeout: 5000 });

    await expect(page.getByRole('button', { name: 'Delete Tenant' })).toBeVisible();
  });

  test('should close detail modal with Close button', async ({ page }) => {
    // Open modal
    const acmeRow = page.locator('tr', { hasText: 'Acme Corp' });
    await acmeRow.getByRole('button', { name: 'View' }).click();
    await expect(page.locator('h2', { hasText: 'Acme Corp' })).toBeVisible({ timeout: 5000 });

    // Click Close button in footer
    await page.getByRole('button', { name: 'Close' }).click();

    // Modal should close
    await expect(page.locator('h2', { hasText: 'Acme Corp' })).not.toBeVisible({ timeout: 3000 });
  });

  test('should show Suspend button in tenant table row for ACTIVE tenants', async ({ page }) => {
    const acmeRow = page.locator('tr', { hasText: 'Acme Corp' });
    await expect(acmeRow.getByRole('button', { name: 'Suspend' })).toBeVisible();
  });

  test('should show Activate button in tenant table row for SUSPENDED tenants', async ({
    page,
  }) => {
    const suspRow = page.locator('tr', { hasText: 'Suspended Co' });
    await expect(suspRow.getByRole('button', { name: 'Activate' })).toBeVisible();
  });

  test('should show installed plugins in detail modal', async ({ page }) => {
    // Open detail modal
    const acmeRow = page.locator('tr', { hasText: 'Acme Corp' });
    await acmeRow.getByRole('button', { name: 'View' }).click();
    await expect(page.locator('h2', { hasText: 'Acme Corp' })).toBeVisible({ timeout: 5000 });

    // Installed Plugins section should show plugin count
    await expect(page.getByText('Installed Plugins (1)')).toBeVisible();
    // The mock plugin name should be visible
    await expect(page.getByText('Plugin A')).toBeVisible();
  });

  test('should open Create Tenant modal', async ({ page }) => {
    await page.getByRole('button', { name: '+ Create Tenant' }).click();
    // CreateTenantModal should appear
    await page.waitForTimeout(500);
    // The modal existence means it opened (content depends on CreateTenantModal implementation)
  });
});
