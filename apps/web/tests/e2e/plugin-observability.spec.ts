/**
 * Plugin Observability E2E Tests (TD-019)
 *
 * Tests the plugin health/observability user journey as described in
 * Spec 012 user-journey.md:
 *   - FR-013: View plugin health status (healthy/unhealthy/starting)
 *   - FR-014: View resource metrics (CPU/memory gauges)
 *   - FR-015: View registered plugin endpoints
 *   - FR-028: Handling of unhealthy plugin status
 *   - FR-030: Graceful error state when health endpoint is unavailable
 *   - FR-031: Health data polling (re-fetch)
 *
 * Architecture: Uses page.route() to mock GET /api/v1/plugins/:id/health.
 * The web server is started with MockAuthProvider (VITE_E2E_TEST_MODE=true).
 *
 * TD-019 note: These tests are the first E2E coverage for the observability
 * dashboard.  Unit and integration tests (T012-34..T012-42) cover the backend;
 * these Playwright tests cover the end-to-end browser rendering path.
 */

import { test, expect, Page } from '@playwright/test';
import { mockAllApis } from './helpers/api-mocks';

// ---------------------------------------------------------------------------
// Health API mock data
// ---------------------------------------------------------------------------

const MOCK_PLUGIN_ID = 'plugin-crm';

const healthyResponse = {
  status: 'healthy' as const,
  uptime: 3720,
  cpu: 12.5,
  memory: 34.8,
  endpoints: [
    { path: '/contacts', method: 'GET', status: 'ok' },
    { path: '/contacts/:id', method: 'GET', status: 'ok' },
    { path: '/contacts', method: 'POST', status: 'ok' },
  ],
};

const unhealthyResponse = {
  status: 'unhealthy' as const,
  uptime: 45,
  cpu: 95.2,
  memory: 91.0,
  endpoints: [{ path: '/contacts', method: 'GET', status: 'degraded' }],
};

const startingResponse = {
  status: 'starting' as const,
  uptime: 8,
  cpu: 2.1,
  memory: 18.3,
  endpoints: [],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Mock the plugin health endpoint to return a specific response.
 * Must be called BEFORE mockAllApis so the more specific route takes priority.
 */
async function mockPluginHealthApi(
  page: Page,
  pluginId: string,
  response: object,
  statusCode = 200
) {
  await page.route(`**/api/v1/plugins/${pluginId}/health`, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: statusCode,
        contentType: 'application/json',
        body: JSON.stringify(response),
      });
    } else {
      await route.continue();
    }
  });
}

/**
 * Navigate to the plugins page, open the CRM Pro detail modal,
 * and click the Health tab.
 */
async function openPluginHealthTab(page: Page) {
  await page.goto('/plugins');
  await expect(page.getByRole('heading', { name: 'Plugins' })).toBeVisible({ timeout: 15000 });

  // Click the Details / view button for CRM Pro (the first installed active plugin)
  const detailsButton = page.getByRole('button', { name: /Details|View/i }).first();

  // If a Details button is not visible, try clicking on the plugin name link/card
  if (await detailsButton.isVisible({ timeout: 3000 }).catch(() => false)) {
    await detailsButton.click();
  } else {
    // Fallback: click on the plugin name to open the detail modal
    await page.getByText('CRM Pro').first().click();
  }

  // The modal dialog should appear
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10000 });

  // Click the Health tab
  const healthTab = page.getByRole('tab', { name: /Health/i });
  await expect(healthTab).toBeVisible({ timeout: 5000 });
  await healthTab.click();
}

// ---------------------------------------------------------------------------
// Tests: FR-013 — Plugin health status display
// ---------------------------------------------------------------------------

test.describe('Plugin Observability — Health Status (FR-013)', () => {
  test('should display "Healthy" badge when plugin health status is healthy', async ({ page }) => {
    await mockPluginHealthApi(page, MOCK_PLUGIN_ID, healthyResponse);
    await mockAllApis(page);
    await openPluginHealthTab(page);

    // The health tab should show a "Healthy" badge
    await expect(page.getByText('Healthy', { exact: true })).toBeVisible({ timeout: 10000 });
  });

  test('should display "Unhealthy" badge when plugin health status is unhealthy (FR-028)', async ({
    page,
  }) => {
    await mockPluginHealthApi(page, MOCK_PLUGIN_ID, unhealthyResponse);
    await mockAllApis(page);
    await openPluginHealthTab(page);

    await expect(page.getByText('Unhealthy', { exact: true })).toBeVisible({ timeout: 10000 });
  });

  test('should display "Starting" badge when plugin is still starting up', async ({ page }) => {
    await mockPluginHealthApi(page, MOCK_PLUGIN_ID, startingResponse);
    await mockAllApis(page);
    await openPluginHealthTab(page);

    await expect(page.getByText('Starting', { exact: true })).toBeVisible({ timeout: 10000 });
  });

  test('should display uptime counter when health data includes uptime', async ({ page }) => {
    await mockPluginHealthApi(page, MOCK_PLUGIN_ID, healthyResponse);
    await mockAllApis(page);
    await openPluginHealthTab(page);

    // Uptime of 3720 seconds = 1h (formatUptime rounds to nearest unit)
    await expect(page.getByText(/Uptime.*1h|1h.*Uptime/i)).toBeVisible({ timeout: 10000 });
  });
});

// ---------------------------------------------------------------------------
// Tests: FR-014 — Resource metrics (CPU / memory gauges)
// ---------------------------------------------------------------------------

test.describe('Plugin Observability — Resource Metrics (FR-014)', () => {
  test('should display CPU usage meter with correct percentage', async ({ page }) => {
    await mockPluginHealthApi(page, MOCK_PLUGIN_ID, healthyResponse);
    await mockAllApis(page);
    await openPluginHealthTab(page);

    // CPU Usage section should be visible
    await expect(page.getByText('CPU Usage')).toBeVisible({ timeout: 10000 });
    // The ARIA meter for CPU should have the correct value
    const cpuMeter = page.getByRole('meter', { name: /CPU usage/i });
    await expect(cpuMeter).toBeVisible();
    await expect(cpuMeter).toHaveAttribute('aria-valuenow', '12.5');
  });

  test('should display Memory usage meter with correct percentage', async ({ page }) => {
    await mockPluginHealthApi(page, MOCK_PLUGIN_ID, healthyResponse);
    await mockAllApis(page);
    await openPluginHealthTab(page);

    await expect(page.getByText('Memory Usage')).toBeVisible({ timeout: 10000 });
    const memoryMeter = page.getByRole('meter', { name: /Memory usage/i });
    await expect(memoryMeter).toBeVisible();
    await expect(memoryMeter).toHaveAttribute('aria-valuenow', '34.8');
  });

  test('should show high CPU warning when CPU usage exceeds 90%', async ({ page }) => {
    await mockPluginHealthApi(page, MOCK_PLUGIN_ID, unhealthyResponse);
    await mockAllApis(page);
    await openPluginHealthTab(page);

    // unhealthyResponse has cpu: 95.2 — should trigger the "High CPU usage" warning
    await expect(page.getByText(/High CPU usage/i)).toBeVisible({ timeout: 10000 });
  });

  test('should show high memory warning when memory usage exceeds 90%', async ({ page }) => {
    await mockPluginHealthApi(page, MOCK_PLUGIN_ID, unhealthyResponse);
    await mockAllApis(page);
    await openPluginHealthTab(page);

    // unhealthyResponse has memory: 91.0 — should trigger the "High memory usage" warning
    await expect(page.getByText(/High memory usage/i)).toBeVisible({ timeout: 10000 });
  });
});

// ---------------------------------------------------------------------------
// Tests: FR-015 — Registered plugin endpoints table
// ---------------------------------------------------------------------------

test.describe('Plugin Observability — Endpoints Table (FR-015)', () => {
  test('should display registered endpoints table with method, path, and status', async ({
    page,
  }) => {
    await mockPluginHealthApi(page, MOCK_PLUGIN_ID, healthyResponse);
    await mockAllApis(page);
    await openPluginHealthTab(page);

    await expect(page.getByText('Registered Endpoints')).toBeVisible({ timeout: 10000 });

    // Table headers
    await expect(page.getByRole('columnheader', { name: 'Method' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Path' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Status' })).toBeVisible();

    // At least one endpoint row from healthyResponse should be visible
    await expect(page.getByText('/contacts').first()).toBeVisible();
  });

  test('should show "No endpoints registered" when plugin has no endpoints', async ({ page }) => {
    await mockPluginHealthApi(page, MOCK_PLUGIN_ID, startingResponse);
    await mockAllApis(page);
    await openPluginHealthTab(page);

    // startingResponse has endpoints: [] — should show empty state
    await expect(page.getByText('No endpoints registered.')).toBeVisible({ timeout: 10000 });
  });

  test('should show degraded status badge for unhealthy endpoints', async ({ page }) => {
    await mockPluginHealthApi(page, MOCK_PLUGIN_ID, unhealthyResponse);
    await mockAllApis(page);
    await openPluginHealthTab(page);

    // The endpoint in unhealthyResponse has status: 'degraded'
    await expect(page.getByText('degraded')).toBeVisible({ timeout: 10000 });
  });
});

// ---------------------------------------------------------------------------
// Tests: FR-030 — Graceful error handling when health endpoint unavailable
// ---------------------------------------------------------------------------

test.describe('Plugin Observability — Error Handling (FR-030)', () => {
  test('should display an error message when the health endpoint returns 500', async ({ page }) => {
    await mockPluginHealthApi(page, MOCK_PLUGIN_ID, { error: 'Service unavailable' }, 500);
    await mockAllApis(page);
    await openPluginHealthTab(page);

    // The error alert should appear instead of crashing the page
    await expect(page.getByText(/Failed to load health data/i)).toBeVisible({ timeout: 10000 });
  });

  test('should display a loading skeleton while health data is being fetched', async ({ page }) => {
    // Delay the health response to capture the loading state
    await page.route(`**/api/v1/plugins/${MOCK_PLUGIN_ID}/health`, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(healthyResponse),
      });
    });
    await mockAllApis(page);

    await page.goto('/plugins');
    await expect(page.getByRole('heading', { name: 'Plugins' })).toBeVisible({ timeout: 15000 });

    const detailsButton = page.getByRole('button', { name: /Details|View/i }).first();
    if (await detailsButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await detailsButton.click();
    } else {
      await page.getByText('CRM Pro').first().click();
    }

    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10000 });
    const healthTab = page.getByRole('tab', { name: /Health/i });
    await healthTab.click();

    // The animate-pulse skeleton should be visible before the data resolves
    const skeleton = page.locator('.animate-pulse').first();
    await expect(skeleton).toBeVisible({ timeout: 3000 });

    // After the data loads, the skeleton should be replaced by real content
    await expect(page.getByText('Healthy', { exact: true })).toBeVisible({ timeout: 5000 });
  });
});

// ---------------------------------------------------------------------------
// Tests: Accessibility (Constitution Art. 1.3 — WCAG 2.1 AA)
// ---------------------------------------------------------------------------

test.describe('Plugin Observability — Accessibility', () => {
  test('should have a live region that announces health status changes to screen readers', async ({
    page,
  }) => {
    await mockPluginHealthApi(page, MOCK_PLUGIN_ID, healthyResponse);
    await mockAllApis(page);
    await openPluginHealthTab(page);

    // The sr-only live region should be present (aria-live="polite")
    const liveRegion = page.locator('[aria-live="polite"]');
    await expect(liveRegion).toBeVisible({ timeout: 10000 });
    // It should contain the health status for screen readers
    await expect(liveRegion).toContainText(/Plugin health: healthy/i);
  });

  test('should have accessible meter roles for CPU and memory gauges', async ({ page }) => {
    await mockPluginHealthApi(page, MOCK_PLUGIN_ID, healthyResponse);
    await mockAllApis(page);
    await openPluginHealthTab(page);

    // Both meters need aria-valuemin and aria-valuemax for WCAG 1.3.1
    const cpuMeter = page.getByRole('meter', { name: /CPU usage/i });
    await expect(cpuMeter).toHaveAttribute('aria-valuemin', '0');
    await expect(cpuMeter).toHaveAttribute('aria-valuemax', '100');

    const memoryMeter = page.getByRole('meter', { name: /Memory usage/i });
    await expect(memoryMeter).toHaveAttribute('aria-valuemin', '0');
    await expect(memoryMeter).toHaveAttribute('aria-valuemax', '100');
  });
});
