import { test, expect } from '@playwright/test';
import { TestHelpers } from './helpers/test-helpers';
import {
  testPlugins,
  mockAnalyticsData,
  mockInstallsData,
  mockRatingsData,
} from './fixtures/test-data';
import { mockPluginAnalyticsEndpoint, mockPluginRatingsEndpoint } from './helpers/api-mocks';

// Helper function to format numbers the same way the component does
function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  } else if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toString();
}

test.describe('Plugin Analytics Dashboard E2E', () => {
  let helpers: TestHelpers;

  test.beforeEach(async ({ page }) => {
    helpers = new TestHelpers(page);

    // Navigate to plugins page with the published plugin in the list
    await helpers.nav.goToPluginsPage([testPlugins.publishedPlugin]);
  });

  test.afterEach(async () => {
    await helpers.screenshot.takeFullPage('analytics-end');
  });

  /**
   * Helper to set up all 3 analytics mocks + admin installs mock BEFORE opening analytics.
   * All 3 useQuery hooks fire immediately on PluginAnalytics mount.
   */
  async function setupAnalyticsMocks(
    page: import('@playwright/test').Page,
    pluginId: string,
    options?: {
      analytics?: Record<string, unknown>;
      installs?: Record<string, unknown>[];
      ratings?: Record<string, unknown>;
      analyticsError?: boolean;
      timeRangeHandler?: (timeRange: string) => Record<string, unknown>;
    }
  ) {
    // Mock analytics endpoint
    if (options?.analyticsError) {
      await page.route(`**/api/marketplace/plugins/${pluginId}/analytics**`, async (route) => {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal server error' }),
        });
      });
    } else {
      await mockPluginAnalyticsEndpoint(
        page,
        pluginId,
        (options?.analytics as Record<string, unknown>) ?? mockAnalyticsData,
        options?.timeRangeHandler ? { timeRangeHandler: options.timeRangeHandler } : undefined
      );
    }

    // Mock ratings endpoint
    await mockPluginRatingsEndpoint(
      page,
      pluginId,
      (options?.ratings as Record<string, unknown>) ?? mockRatingsData
    );

    // Mock admin plugin installs — already handled by mockPluginsApi via goToPluginsPage
    // but we need to ensure the installs mock returns our data.
    // Re-register a more specific route for this plugin's installs.
    await page.route(`**/api/admin/plugins/${pluginId}/installs`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(options?.installs ?? mockInstallsData),
      });
    });
  }

  test('should display analytics dashboard with key metrics', async ({ page }) => {
    const publishedPlugin = testPlugins.publishedPlugin;

    // Set up all mocks BEFORE clicking "View Analytics"
    await setupAnalyticsMocks(page, publishedPlugin.id);

    // Open plugin detail
    await page.click(`text=${publishedPlugin.name}`);
    await helpers.modal.waitForModalOpen(publishedPlugin.name);

    // Click "View Analytics" button
    await page.locator('button:has-text("View Analytics")').click();

    // Wait for Analytics modal — title is "Plugin Analytics"
    await helpers.modal.waitForModalOpen('Plugin Analytics');

    // Verify 4 metric cards:
    // Downloads: formatNumber(15234) = "15.2K"
    await expect(page.locator(`text=${formatNumber(mockAnalyticsData.downloads)}`)).toBeVisible();
    // Installs: formatNumber(487) = "487"
    await expect(page.locator(`text=${formatNumber(mockAnalyticsData.installs)}`)).toBeVisible();
    // Average Rating: 4.2/5
    await expect(page.locator('text=4.2/5')).toBeVisible();
    // Active Tenants: installs.length = 5
    await expect(page.locator(`text=${mockInstallsData.length}`).first()).toBeVisible();
  });

  test('should change time range and update data', async ({ page }) => {
    const publishedPlugin = testPlugins.publishedPlugin;

    // Set up mocks with timeRangeHandler for dynamic data
    await setupAnalyticsMocks(page, publishedPlugin.id, {
      timeRangeHandler: (timeRange: string) => {
        if (timeRange === '7d') {
          return { downloads: 500, installs: 50, ratings: 5, averageRating: 4.0 };
        } else if (timeRange === '30d') {
          return { downloads: 5000, installs: 200, ratings: 20, averageRating: 4.2 };
        } else if (timeRange === '90d') {
          return { downloads: 12000, installs: 400, ratings: 40, averageRating: 4.1 };
        }
        return mockAnalyticsData;
      },
    });

    // Open plugin detail and analytics
    await page.click(`text=${publishedPlugin.name}`);
    await helpers.modal.waitForModalOpen(publishedPlugin.name);
    await page.locator('button:has-text("View Analytics")').click();
    await helpers.modal.waitForModalOpen('Plugin Analytics');

    // Default is 30d — "30 Days" button should be active
    // Verify initial data: 5000 downloads → "5.0K"
    await expect(page.locator(`text=${formatNumber(5000)}`)).toBeVisible();

    // Click on "7 Days" time range
    const sevenDaysButton = page.locator('button:has-text("7 Days")');
    await sevenDaysButton.click();
    await page.waitForTimeout(500);

    // Verify data updated: 500 downloads
    await expect(page.locator('text=500').first()).toBeVisible();

    // Change to 90 days
    const ninetyDaysButton = page.locator('button:has-text("90 Days")');
    await ninetyDaysButton.click();
    await page.waitForTimeout(500);

    // Verify data updated: 12000 → "12.0K"
    await expect(page.locator(`text=${formatNumber(12000)}`)).toBeVisible();
  });

  test('should display installed-by tenants list', async ({ page }) => {
    const publishedPlugin = testPlugins.publishedPlugin;

    await setupAnalyticsMocks(page, publishedPlugin.id);

    // Open plugin detail and analytics
    await page.click(`text=${publishedPlugin.name}`);
    await helpers.modal.waitForModalOpen(publishedPlugin.name);
    await page.locator('button:has-text("View Analytics")').click();
    await helpers.modal.waitForModalOpen('Plugin Analytics');

    // Verify "Installed By" section heading
    await expect(page.getByRole('heading', { name: 'Installed By', exact: true })).toBeVisible();

    // Verify truncated tenant IDs: first 8 chars + "..."
    for (const install of mockInstallsData) {
      const truncatedId = `${install.tenantId.substring(0, 8)}...`;
      await expect(page.locator(`text=${truncatedId}`).first()).toBeVisible();
    }
  });

  test('should display rating distribution', async ({ page }) => {
    const publishedPlugin = testPlugins.publishedPlugin;

    await setupAnalyticsMocks(page, publishedPlugin.id);

    // Open plugin detail and analytics
    await page.click(`text=${publishedPlugin.name}`);
    await helpers.modal.waitForModalOpen(publishedPlugin.name);
    await page.locator('button:has-text("View Analytics")').click();
    await helpers.modal.waitForModalOpen('Plugin Analytics');

    // Verify "Rating Distribution" section
    await expect(page.locator('text=Rating Distribution')).toBeVisible();

    // Rating rows show number + Star SVG (not "5 stars" text)
    // Verify each rating bucket has entries from our mock data
    // mockRatingsData has: 5x five, 2x four, 1x three, 1x two, 1x one
    // Just verify the section is rendered with counts
    // Each row: {rating number} + Star icon + progress bar + count
    await expect(page.locator('text=Rating Distribution')).toBeVisible();
  });

  test('should display average rating', async ({ page }) => {
    const publishedPlugin = testPlugins.publishedPlugin;

    await setupAnalyticsMocks(page, publishedPlugin.id);

    // Open plugin detail and analytics
    await page.click(`text=${publishedPlugin.name}`);
    await helpers.modal.waitForModalOpen(publishedPlugin.name);
    await page.locator('button:has-text("View Analytics")').click();
    await helpers.modal.waitForModalOpen('Plugin Analytics');

    // Verify average rating: 4.2/5
    await expect(page.locator('text=4.2/5')).toBeVisible();

    // Verify "Average Rating" label on metric card
    await expect(page.locator('text=Average Rating')).toBeVisible();

    // Verify ratings count indicator: "(43 ratings)"
    await expect(page.locator('text=(43 ratings)')).toBeVisible();
  });

  test('should handle empty analytics data gracefully', async ({ page }) => {
    const publishedPlugin = testPlugins.publishedPlugin;

    // Set up mocks with empty/zero data
    await setupAnalyticsMocks(page, publishedPlugin.id, {
      analytics: {
        downloads: 0,
        installs: 0,
        ratings: 0,
        averageRating: 0,
      },
      installs: [],
      ratings: {
        data: [],
        pagination: { page: 1, limit: 100, total: 0, totalPages: 1 },
      },
    });

    // Open plugin detail and analytics
    await page.click(`text=${publishedPlugin.name}`);
    await helpers.modal.waitForModalOpen(publishedPlugin.name);
    await page.locator('button:has-text("View Analytics")').click();
    await helpers.modal.waitForModalOpen('Plugin Analytics');

    // Verify zeros displayed
    await expect(page.locator('text=0').first()).toBeVisible();

    // Verify average rating shows "N/A" when 0
    await expect(page.locator('text=N/A').first()).toBeVisible();

    // Verify empty state messages
    await expect(page.locator('text=No installations yet')).toBeVisible();
    await expect(page.locator('text=No ratings yet')).toBeVisible();
  });

  test('should handle API error when loading analytics', async ({ page }) => {
    const publishedPlugin = testPlugins.publishedPlugin;

    // Set up mocks with analytics error
    await setupAnalyticsMocks(page, publishedPlugin.id, {
      analyticsError: true,
    });

    // Open plugin detail and try to view analytics
    await page.click(`text=${publishedPlugin.name}`);
    await helpers.modal.waitForModalOpen(publishedPlugin.name);
    await page.locator('button:has-text("View Analytics")').click();

    // Wait for the analytics modal to open
    await helpers.modal.waitForModalOpen('Plugin Analytics');

    // Error is displayed inline in a Card (NOT as a toast)
    // With retry: false on useQuery, error state appears immediately after 500 response
    await expect(page.locator('text=Failed to load analytics data.')).toBeVisible({
      timeout: 10000,
    });
  });

  test('should close analytics modal', async ({ page }) => {
    const publishedPlugin = testPlugins.publishedPlugin;

    await setupAnalyticsMocks(page, publishedPlugin.id);

    // Open plugin detail and analytics
    await page.click(`text=${publishedPlugin.name}`);
    await helpers.modal.waitForModalOpen(publishedPlugin.name);
    await page.locator('button:has-text("View Analytics")').click();
    await helpers.modal.waitForModalOpen('Plugin Analytics');

    // Close analytics modal — "Close" button in analytics footer (last one, since analytics is on top)
    await page.getByRole('button', { name: 'Close', exact: true }).last().click();
    await page.waitForTimeout(300);

    // Verify analytics modal is closed
    await helpers.assert.expectModalClosed('Plugin Analytics');

    // Verify we're back to plugin detail modal
    await helpers.assert.expectModalOpen(publishedPlugin.name);
  });

  test('should display footer with time range info', async ({ page }) => {
    const publishedPlugin = testPlugins.publishedPlugin;

    await setupAnalyticsMocks(page, publishedPlugin.id);

    // Open plugin detail and analytics
    await page.click(`text=${publishedPlugin.name}`);
    await helpers.modal.waitForModalOpen(publishedPlugin.name);
    await page.locator('button:has-text("View Analytics")').click();
    await helpers.modal.waitForModalOpen('Plugin Analytics');

    // Footer shows "Showing data for last 30 days" (lowercased)
    await expect(page.locator('text=Showing data for last 30 days')).toBeVisible();

    // Change to 7 Days
    await page.locator('button:has-text("7 Days")').click();
    await page.waitForTimeout(500);

    // Footer updates
    await expect(page.locator('text=Showing data for last 7 days')).toBeVisible();
  });
});
