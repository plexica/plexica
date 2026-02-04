import { test, expect } from '@playwright/test';
import { TestHelpers } from './helpers/test-helpers';
import { testPlugins, mockAnalyticsData } from './fixtures/test-data';

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

    // Authentication is handled by global setup via storage state
    // No need to login here - we're already authenticated!

    // Navigate to plugins page with the published plugin in the list
    await helpers.nav.goToPluginsPage([testPlugins.publishedPlugin]);
  });

  test.afterEach(async () => {
    await helpers.screenshot.takeFullPage('analytics-end');
  });

  test('should display analytics dashboard with key metrics', async ({ page }) => {
    const publishedPlugin = testPlugins.publishedPlugin;

    // Mock plugin details API
    await page.route(`**/api/admin/plugins/${publishedPlugin.id}`, async (route) => {
      console.log('Mocking plugin details API:', route.request().url());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(publishedPlugin),
      });
    });

    // Mock analytics API
    await page.route(
      `**/api/marketplace/plugins/${publishedPlugin.id}/analytics*`,
      async (route) => {
        console.log('Mocking analytics API:', route.request().url());
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockAnalyticsData),
        });
      }
    );

    // Open plugin detail
    await page.click(`text=${publishedPlugin.name}`);
    await helpers.modal.waitForModalOpen(publishedPlugin.name);

    // Click "View Analytics" button
    const analyticsButton = page.locator('button:has-text("View Analytics")');
    await analyticsButton.click();

    // Wait for Analytics modal
    await helpers.modal.waitForModalOpen('Analytics');

    // Verify key metrics cards are displayed (using formatted numbers)
    await expect(
      page.locator(`text=${formatNumber(mockAnalyticsData.totalDownloads)}`)
    ).toBeVisible();
    await expect(
      page.locator(`text=${formatNumber(mockAnalyticsData.totalInstalls)}`)
    ).toBeVisible();
    await expect(
      page.locator(`text=${formatNumber(mockAnalyticsData.activeInstalls)}`)
    ).toBeVisible();

    // Verify growth rate is displayed
    const growthText = `${mockAnalyticsData.growthRate > 0 ? '+' : ''}${mockAnalyticsData.growthRate}%`;
    await expect(page.locator(`text=${growthText}`)).toBeVisible();

    // TODO: Fix modal screenshot - modal selector needs updating
    // await helpers.screenshot.takeModal('analytics-dashboard');
  });

  test('should display charts for downloads and installs', async ({ page }) => {
    const publishedPlugin = testPlugins.publishedPlugin;

    // Mock APIs
    await page.route(`**/api/admin/plugins/${publishedPlugin.id}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(publishedPlugin),
      });
    });

    await page.route(
      `**/api/marketplace/plugins/${publishedPlugin.id}/analytics*`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockAnalyticsData),
        });
      }
    );

    // Open plugin detail and analytics
    await page.click(`text=${publishedPlugin.name}`);
    await helpers.modal.waitForModalOpen(publishedPlugin.name);
    await page.locator('button:has-text("View Analytics")').click();
    await helpers.modal.waitForModalOpen('Analytics');

    // Verify chart titles
    await expect(page.locator('text=Downloads Over Time')).toBeVisible();
    await expect(page.locator('text=Installs Over Time')).toBeVisible();

    // Verify charts are rendered (look for chart containers)
    const downloadChart = page.locator('[data-chart="downloads"]');
    await expect(downloadChart).toBeVisible();

    const installChart = page.locator('[data-chart="installs"]');
    await expect(installChart).toBeVisible();

    // Take screenshot of charts
    await helpers.screenshot.takeModal('analytics-charts');
  });

  test('should change time range and update data', async ({ page }) => {
    const publishedPlugin = testPlugins.publishedPlugin;

    let requestedTimeRange = 'all';

    // Mock APIs with dynamic time range
    await page.route(`**/api/admin/plugins/${publishedPlugin.id}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(publishedPlugin),
      });
    });

    await page.route(
      `**/api/marketplace/plugins/${publishedPlugin.id}/analytics*`,
      async (route) => {
        const url = route.request().url();
        if (url.includes('timeRange=7d')) {
          requestedTimeRange = '7d';
        } else if (url.includes('timeRange=30d')) {
          requestedTimeRange = '30d';
        } else if (url.includes('timeRange=90d')) {
          requestedTimeRange = '90d';
        }

        // Return different data based on time range
        const data = {
          ...mockAnalyticsData,
          totalDownloads:
            requestedTimeRange === '7d'
              ? 500
              : requestedTimeRange === '30d'
                ? 5000
                : mockAnalyticsData.totalDownloads,
        };

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(data),
        });
      }
    );

    // Open plugin detail and analytics
    await page.click(`text=${publishedPlugin.name}`);
    await helpers.modal.waitForModalOpen(publishedPlugin.name);
    await page.locator('button:has-text("View Analytics")').click();
    await helpers.modal.waitForModalOpen('Analytics');

    // Verify default time range (should be "all" or "30d")
    await expect(
      page.locator('button:has-text("All Time"), button:has-text("30 Days")')
    ).toBeVisible();

    // Click on "7 Days" time range
    const sevenDaysButton = page.locator('button:has-text("7 Days")');
    await sevenDaysButton.click();

    // Wait for API call with new time range
    await helpers.wait.forApiCall('timeRange=7d');

    // Verify data updated (total downloads should be 500)
    await expect(page.locator('text=500')).toBeVisible();

    // Take screenshot with 7-day range
    await helpers.screenshot.takeModal('analytics-7day-range');

    // Change to 30 days
    const thirtyDaysButton = page.locator('button:has-text("30 Days")');
    await thirtyDaysButton.click();

    // Wait for API call
    await helpers.wait.forApiCall('timeRange=30d');

    // Verify data updated
    await expect(page.locator('text=5,000')).toBeVisible();
  });

  test('should display top tenants list', async ({ page }) => {
    const publishedPlugin = testPlugins.publishedPlugin;

    // Mock APIs
    await page.route(`**/api/admin/plugins/${publishedPlugin.id}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(publishedPlugin),
      });
    });

    await page.route(
      `**/api/marketplace/plugins/${publishedPlugin.id}/analytics*`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockAnalyticsData),
        });
      }
    );

    // Open plugin detail and analytics
    await page.click(`text=${publishedPlugin.name}`);
    await helpers.modal.waitForModalOpen(publishedPlugin.name);
    await page.locator('button:has-text("View Analytics")').click();
    await helpers.modal.waitForModalOpen('Analytics');

    // Scroll to Top Tenants section
    await page.evaluate(() => {
      // @ts-expect-error - document is available in browser context
      const modal = document.querySelector('[role="dialog"]');
      if (modal) modal.scrollTop = modal.scrollHeight / 2;
    });

    // Verify "Top Tenants" section
    await expect(page.locator('text=Top Tenants')).toBeVisible();

    // Verify tenant names are displayed
    for (const tenant of mockAnalyticsData.topTenants) {
      await expect(page.locator(`text=${tenant.tenantName}`)).toBeVisible();
    }

    // Take screenshot of top tenants
    await helpers.screenshot.takeModal('analytics-top-tenants');
  });

  test('should display rating distribution', async ({ page }) => {
    const publishedPlugin = testPlugins.publishedPlugin;

    // Mock APIs
    await page.route(`**/api/admin/plugins/${publishedPlugin.id}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(publishedPlugin),
      });
    });

    await page.route(
      `**/api/marketplace/plugins/${publishedPlugin.id}/analytics*`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockAnalyticsData),
        });
      }
    );

    // Open plugin detail and analytics
    await page.click(`text=${publishedPlugin.name}`);
    await helpers.modal.waitForModalOpen(publishedPlugin.name);
    await page.locator('button:has-text("View Analytics")').click();
    await helpers.modal.waitForModalOpen('Analytics');

    // Scroll to Rating Distribution section
    await page.evaluate(() => {
      // @ts-expect-error - document is available in browser context
      const modal = document.querySelector('[role="dialog"]');
      if (modal) modal.scrollTop = modal.scrollHeight;
    });

    // Verify "Rating Distribution" section
    await expect(page.locator('text=Rating Distribution')).toBeVisible();

    // Verify star ratings are displayed
    await expect(page.locator('text=5 stars')).toBeVisible();
    await expect(page.locator('text=4 stars')).toBeVisible();
    await expect(page.locator('text=3 stars')).toBeVisible();
    await expect(page.locator('text=2 stars')).toBeVisible();
    await expect(page.locator('text=1 star')).toBeVisible();

    // Verify counts are displayed
    const distribution = mockAnalyticsData.ratingDistribution;
    await expect(page.locator(`text=${distribution[5]}`).first()).toBeVisible();
    await expect(page.locator(`text=${distribution[4]}`).first()).toBeVisible();

    // Take screenshot of rating distribution
    await helpers.screenshot.takeModal('analytics-rating-distribution');
  });

  test('should display average rating', async ({ page }) => {
    const publishedPlugin = testPlugins.publishedPlugin;

    // Calculate average rating from distribution
    const distribution = mockAnalyticsData.ratingDistribution;
    const totalRatings = Object.values(distribution).reduce((a, b) => a + b, 0);
    const sumRatings = Object.entries(distribution).reduce(
      (sum, [stars, count]) => sum + parseInt(stars) * count,
      0
    );
    const averageRating = (sumRatings / totalRatings).toFixed(1);

    // Mock APIs
    await page.route(`**/api/admin/plugins/${publishedPlugin.id}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(publishedPlugin),
      });
    });

    await page.route(
      `**/api/marketplace/plugins/${publishedPlugin.id}/analytics*`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ...mockAnalyticsData,
            averageRating: parseFloat(averageRating),
          }),
        });
      }
    );

    // Open plugin detail and analytics
    await page.click(`text=${publishedPlugin.name}`);
    await helpers.modal.waitForModalOpen(publishedPlugin.name);
    await page.locator('button:has-text("View Analytics")').click();
    await helpers.modal.waitForModalOpen('Analytics');

    // Verify average rating is displayed
    await expect(page.locator(`text=${averageRating}`)).toBeVisible();

    // Verify star icon or rating indicator
    await expect(page.locator('text=Average Rating')).toBeVisible();
  });

  test('should handle empty analytics data gracefully', async ({ page }) => {
    const publishedPlugin = testPlugins.publishedPlugin;

    // Mock APIs with empty data
    await page.route(`**/api/admin/plugins/${publishedPlugin.id}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(publishedPlugin),
      });
    });

    await page.route(
      `**/api/marketplace/plugins/${publishedPlugin.id}/analytics*`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            totalDownloads: 0,
            totalInstalls: 0,
            activeInstalls: 0,
            growthRate: 0,
            downloadsByDay: [],
            installsByDay: [],
            topTenants: [],
            ratingDistribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
            averageRating: 0,
          }),
        });
      }
    );

    // Open plugin detail and analytics
    await page.click(`text=${publishedPlugin.name}`);
    await helpers.modal.waitForModalOpen(publishedPlugin.name);
    await page.locator('button:has-text("View Analytics")').click();
    await helpers.modal.waitForModalOpen('Analytics');

    // Verify zeros are displayed
    await expect(page.locator('text=0').first()).toBeVisible();

    // Verify empty state messages
    await expect(
      page.locator('text=No data available, text=No tenants yet, text=No ratings yet')
    ).toBeVisible();

    // Take screenshot of empty state
    await helpers.screenshot.takeModal('analytics-empty-state');
  });

  test('should handle API error when loading analytics', async ({ page }) => {
    const publishedPlugin = testPlugins.publishedPlugin;

    // Mock plugin details API
    await page.route(`**/api/admin/plugins/${publishedPlugin.id}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(publishedPlugin),
      });
    });

    // Mock analytics API error
    await page.route(
      `**/api/marketplace/plugins/${publishedPlugin.id}/analytics*`,
      async (route) => {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Internal server error',
          }),
        });
      }
    );

    // Open plugin detail and try to view analytics
    await page.click(`text=${publishedPlugin.name}`);
    await helpers.modal.waitForModalOpen(publishedPlugin.name);
    await page.locator('button:has-text("View Analytics")').click();

    // Wait a moment for the error to occur
    await page.waitForTimeout(1000);

    // Verify error toast or message
    await helpers.assert.expectToastMessage('Failed to load analytics');

    // Take screenshot of error state
    await helpers.screenshot.takeFullPage('analytics-error');
  });

  test('should close analytics modal', async ({ page }) => {
    const publishedPlugin = testPlugins.publishedPlugin;

    // Mock APIs
    await page.route(`**/api/admin/plugins/${publishedPlugin.id}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(publishedPlugin),
      });
    });

    await page.route(
      `**/api/marketplace/plugins/${publishedPlugin.id}/analytics*`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockAnalyticsData),
        });
      }
    );

    // Open plugin detail and analytics
    await page.click(`text=${publishedPlugin.name}`);
    await helpers.modal.waitForModalOpen(publishedPlugin.name);
    await page.locator('button:has-text("View Analytics")').click();
    await helpers.modal.waitForModalOpen('Analytics');

    // Close analytics modal
    await helpers.modal.closeModal();

    // Verify analytics modal is closed
    await helpers.assert.expectModalClosed('Analytics');

    // Verify we're back to plugin detail modal
    await helpers.assert.expectModalOpen(publishedPlugin.name);
  });

  test('should display growth rate with correct icon', async ({ page }) => {
    const publishedPlugin = testPlugins.publishedPlugin;

    // Test positive growth
    await page.route(`**/api/admin/plugins/${publishedPlugin.id}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(publishedPlugin),
      });
    });

    await page.route(
      `**/api/marketplace/plugins/${publishedPlugin.id}/analytics*`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ...mockAnalyticsData,
            growthRate: 15.5,
          }),
        });
      }
    );

    // Open analytics
    await page.click(`text=${publishedPlugin.name}`);
    await helpers.modal.waitForModalOpen(publishedPlugin.name);
    await page.locator('button:has-text("View Analytics")').click();
    await helpers.modal.waitForModalOpen('Analytics');

    // Verify positive growth rate with + symbol
    await expect(page.locator('text=+15.5%')).toBeVisible();

    // Close and test negative growth
    await helpers.modal.closeModal();
    await helpers.modal.closeModal(); // Close plugin detail too

    // Mock negative growth
    await page.unroute('**/api/marketplace/plugins/**');
    await page.route(
      `**/api/marketplace/plugins/${publishedPlugin.id}/analytics*`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ...mockAnalyticsData,
            growthRate: -8.3,
          }),
        });
      }
    );

    // Reopen analytics
    await page.click(`text=${publishedPlugin.name}`);
    await helpers.modal.waitForModalOpen(publishedPlugin.name);
    await page.locator('button:has-text("View Analytics")').click();
    await helpers.modal.waitForModalOpen('Analytics');

    // Verify negative growth rate
    await expect(page.locator('text=-8.3%')).toBeVisible();
  });
});
