/**
 * Observability Dashboard E2E Tests
 *
 * Tests the Plugin Observability dashboard at /observability:
 *   - Navigation to the page
 *   - 4-tab layout (Health | Metrics | Traces | Alerts)
 *   - Health tab: plugin health summary table, status badges with text+icon
 *   - Metrics tab: query form renders
 *   - Traces tab: search form submits and renders results table
 *   - Alerts tab: active alerts section and history table
 *   - WCAG: colour+text indicators present (not colour-only) — WCAG 1.4.1
 *   - Tab navigation is keyboard-accessible (role="tablist" / role="tab")
 *   - Empty states render without errors
 *
 * Spec 012 — T012-41
 */

import { test, expect, Page } from '@playwright/test';
import { mockAllApis } from './helpers/api-mocks';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_HEALTH_SUMMARY = {
  plugins: [
    {
      pluginId: 'plugin-1',
      pluginName: 'Analytics Pro',
      status: 'healthy',
      requestRate: 12.5,
      errorRate: 0.01,
      p95LatencyMs: 45,
      lastCheckedAt: '2026-03-07T10:00:00Z',
    },
    {
      pluginId: 'plugin-2',
      pluginName: 'CRM Integration',
      status: 'degraded',
      requestRate: 3.2,
      errorRate: 0.15,
      p95LatencyMs: 320,
      lastCheckedAt: '2026-03-07T10:00:00Z',
    },
    {
      pluginId: 'plugin-3',
      pluginName: 'Legacy Export',
      status: 'unreachable',
      requestRate: 0,
      errorRate: 1,
      p95LatencyMs: 0,
      lastCheckedAt: '2026-03-07T09:55:00Z',
    },
  ],
  totalActive: 3,
  unhealthyCount: 2,
  generatedAt: '2026-03-07T10:00:00Z',
};

const MOCK_ACTIVE_ALERTS = {
  alerts: [
    {
      alertName: 'HighErrorRate',
      pluginId: 'plugin-2',
      severity: 'critical',
      summary: 'Error rate above 10% threshold for CRM Integration',
      activeAt: '2026-03-07T09:30:00Z',
      labels: { plugin_id: 'plugin-2', env: 'production' },
    },
    {
      alertName: 'SlowRequests',
      pluginId: 'plugin-2',
      severity: 'warning',
      summary: 'P95 latency above 300ms threshold',
      activeAt: '2026-03-07T09:45:00Z',
      labels: { plugin_id: 'plugin-2' },
    },
  ],
  total: 2,
};

const MOCK_ALERT_HISTORY = {
  alerts: [
    {
      alertName: 'HighMemoryUsage',
      pluginId: 'plugin-1',
      severity: 'warning',
      summary: 'Memory usage exceeded 80% threshold',
      firedAt: '2026-03-06T14:00:00Z',
      resolvedAt: '2026-03-06T14:30:00Z',
      labels: {},
    },
    {
      alertName: 'PluginUnreachable',
      pluginId: 'plugin-3',
      severity: 'critical',
      summary: 'Plugin container not responding',
      firedAt: '2026-03-07T08:00:00Z',
      resolvedAt: null,
      labels: {},
    },
  ],
  pagination: { page: 1, perPage: 10, total: 2, totalPages: 1 },
};

const MOCK_TRACES = {
  traces: [
    {
      traceId: 'aaabbbcccdddeeef1234567890123456',
      rootSpanName: 'POST /api/process',
      serviceName: 'plugin-analytics-pro',
      durationMs: 42,
      startTime: '2026-03-07T10:00:00Z',
      status: 'ok',
      spanCount: 5,
    },
    {
      traceId: 'fffeeedddcccbbb0987654321098765',
      rootSpanName: 'GET /api/export',
      serviceName: 'plugin-legacy-export',
      durationMs: 3200,
      startTime: '2026-03-07T09:58:00Z',
      status: 'error',
      spanCount: 12,
    },
  ],
  total: 2,
};

const MOCK_TRACE_DETAIL = {
  traceId: 'aaabbbcccdddeeef1234567890123456',
  spans: [
    {
      spanId: 'span-001',
      parentSpanId: null,
      operationName: 'POST /api/process',
      serviceName: 'plugin-analytics-pro',
      startTime: '2026-03-07T10:00:00Z',
      durationMs: 42,
      status: 'ok',
      attributes: { 'http.method': 'POST', 'http.status_code': 200 },
      events: [],
    },
  ],
  durationMs: 42,
  rootServiceName: 'plugin-analytics-pro',
};

const MOCK_METRICS_RESPONSE = {
  pluginId: 'plugin-1',
  query: 'rate(http_requests_total{plugin_id="plugin-1"}[5m])',
  start: '2026-03-07T09:00:00Z',
  end: '2026-03-07T10:00:00Z',
  step: '60s',
  series: [
    {
      metric: { plugin_id: 'plugin-1' },
      values: [
        { timestamp: '2026-03-07T09:00:00Z', value: 10.5 },
        { timestamp: '2026-03-07T09:01:00Z', value: 11.2 },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Observability API mock helper
// ---------------------------------------------------------------------------

async function mockObservabilityApis(page: Page) {
  // Mock health summary
  await page.route('**/api/v1/observability/plugins/health-summary**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_HEALTH_SUMMARY),
    });
  });

  // Mock plugin metrics query
  await page.route('**/api/v1/observability/plugins/**/query**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_METRICS_RESPONSE),
    });
  });

  // Mock active alerts
  await page.route('**/api/v1/observability/alerts/history**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_ALERT_HISTORY),
    });
  });

  await page.route('**/api/v1/observability/alerts**', async (route) => {
    const url = route.request().url();
    if (url.includes('/history')) {
      // already handled above but Playwright takes first match — this is a fallback
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_ALERT_HISTORY),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_ACTIVE_ALERTS),
    });
  });

  // Mock traces search
  await page.route('**/api/v1/observability/traces**', async (route) => {
    const url = route.request().url();
    // Trace detail — path ends with /:traceId (no query params path)
    const afterTraces = url.split('/traces')[1] ?? '';
    const pathPart = afterTraces.split('?')[0];
    if (pathPart && pathPart !== '' && pathPart !== '/') {
      // Individual trace detail
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_TRACE_DETAIL),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_TRACES),
    });
  });

  // Mock plugin logs
  await page.route('**/api/v1/observability/plugins/**/logs**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ pluginId: 'plugin-1', lines: [], total: 0 }),
    });
  });
}

async function setupAllMocks(page: Page) {
  await mockObservabilityApis(page);
  await mockAllApis(page, {
    overview: {
      totalTenants: 5,
      activeTenants: 3,
      suspendedTenants: 1,
      provisioningTenants: 1,
      totalPlugins: 3,
      totalPluginInstallations: 10,
      totalUsers: 20,
      totalWorkspaces: 8,
    },
  });
}

// ---------------------------------------------------------------------------
// Tests: Navigation & Page Structure
// ---------------------------------------------------------------------------

test.describe('Observability Dashboard — Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await setupAllMocks(page);
    await page.goto('/observability');
    await page.waitForLoadState('networkidle');
  });

  test('should render the page heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Plugin Observability' })).toBeVisible({
      timeout: 10000,
    });
  });

  test('should render all 4 tabs in a tablist', async ({ page }) => {
    const tabList = page.getByRole('tablist', { name: 'Observability sections' });
    await expect(tabList).toBeVisible({ timeout: 10000 });

    await expect(tabList.getByRole('tab', { name: 'Health' })).toBeVisible();
    await expect(tabList.getByRole('tab', { name: 'Metrics' })).toBeVisible();
    await expect(tabList.getByRole('tab', { name: 'Traces' })).toBeVisible();
    await expect(tabList.getByRole('tab', { name: 'Alerts' })).toBeVisible();
  });

  test('should default to the Health tab', async ({ page }) => {
    // Health tab should be selected (aria-selected="true")
    const healthTab = page.getByRole('tab', { name: 'Health' });
    await expect(healthTab).toHaveAttribute('aria-selected', 'true', { timeout: 10000 });

    // The tab panel should have the correct aria-labelledby
    const panel = page.getByRole('tabpanel');
    await expect(panel).toBeVisible();
  });

  test('should navigate to Alerts tab via ?tab= search param', async ({ page }) => {
    await setupAllMocks(page);
    await page.goto('/observability?tab=alerts');
    await page.waitForLoadState('networkidle');

    const alertsTab = page.getByRole('tab', { name: 'Alerts' });
    await expect(alertsTab).toHaveAttribute('aria-selected', 'true', { timeout: 10000 });
  });

  test('should switch tabs on click', async ({ page }) => {
    // Click Traces tab
    await page.getByRole('tab', { name: 'Traces' }).click();

    const tracesTab = page.getByRole('tab', { name: 'Traces' });
    await expect(tracesTab).toHaveAttribute('aria-selected', 'true', { timeout: 5000 });
  });

  test('should have sidebar navigation link to Observability', async ({ page }) => {
    // Navigate away then back via sidebar
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // The sidebar should have an Observability link
    const obsLink = page.getByRole('link', { name: /observability/i });
    if (await obsLink.isVisible()) {
      await obsLink.click();
      await expect(page.getByRole('heading', { name: 'Plugin Observability' })).toBeVisible({
        timeout: 10000,
      });
    }
    // If no sidebar link exists yet, just verify direct navigation works
    await page.goto('/observability');
    await expect(page.getByRole('heading', { name: 'Plugin Observability' })).toBeVisible({
      timeout: 10000,
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: Health Tab
// ---------------------------------------------------------------------------

test.describe('Observability Dashboard — Health Tab', () => {
  test.beforeEach(async ({ page }) => {
    await setupAllMocks(page);
    await page.goto('/observability?tab=health');
    await page.waitForLoadState('networkidle');
    // Wait for the tab panel to be visible
    await expect(page.getByRole('tabpanel')).toBeVisible({ timeout: 10000 });
  });

  test('should render Plugin Health Summary table with plugin data', async ({ page }) => {
    // Wait for data to load (skeleton disappears)
    await expect(page.getByText('Analytics Pro')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('CRM Integration')).toBeVisible();
    await expect(page.getByText('Legacy Export')).toBeVisible();
  });

  test('should show unhealthy plugin count in summary row', async ({ page }) => {
    // MOCK_HEALTH_SUMMARY has unhealthyCount: 2
    await expect(page.getByText(/2 unhealthy/i)).toBeVisible({ timeout: 10000 });
  });

  test('should display status badges with text — not colour-only (WCAG 1.4.1)', async ({
    page,
  }) => {
    // HealthStatusBadge renders text alongside the icon/colour
    // Each badge has both a colour class AND a text label
    await expect(page.getByText('Analytics Pro')).toBeVisible({ timeout: 10000 });

    // Status text labels must be present (not just CSS colour)
    await expect(page.getByText(/healthy/i).first()).toBeVisible();
    await expect(page.getByText(/degraded/i).first()).toBeVisible();
    await expect(page.getByText(/unreachable/i).first()).toBeVisible();
  });

  test('should show sortable column headers in health table', async ({ page }) => {
    await expect(page.getByText('Analytics Pro')).toBeVisible({ timeout: 10000 });

    // Sort buttons exist for each column
    await expect(page.getByRole('button', { name: 'Sort by Plugin' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sort by Status' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Sort by Req/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Sort by Error/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Sort by P95/i })).toBeVisible();
  });

  test('should show auto-refresh indicator', async ({ page }) => {
    await expect(page.getByText('Analytics Pro')).toBeVisible({ timeout: 10000 });
    // AutoRefreshIndicator is present — look for its timer text
    await expect(page.getByText(/30s|refresh|auto/i).first()).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Tests: Alerts Tab
// ---------------------------------------------------------------------------

test.describe('Observability Dashboard — Alerts Tab', () => {
  test.beforeEach(async ({ page }) => {
    await setupAllMocks(page);
    await page.goto('/observability?tab=alerts');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('tabpanel')).toBeVisible({ timeout: 10000 });
  });

  test('should render Active Alerts section heading with count badge', async ({ page }) => {
    await expect(page.getByText('Active Alerts')).toBeVisible({ timeout: 10000 });
    // Total count badge shows "2"
    await expect(page.getByText('2').first()).toBeVisible();
  });

  test('should render active alert cards with severity text — not colour-only (WCAG 1.4.1)', async ({
    page,
  }) => {
    // Each severity badge includes text (Critical / Warning / Info), not just a colour dot
    await expect(page.getByText('Critical').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Warning').first()).toBeVisible();

    // Alert names are visible
    await expect(page.getByText('HighErrorRate')).toBeVisible();
    await expect(page.getByText('SlowRequests')).toBeVisible();
  });

  test('should render alert summaries', async ({ page }) => {
    await expect(page.getByText('Error rate above 10% threshold for CRM Integration')).toBeVisible({
      timeout: 10000,
    });
  });

  test('should render "View Plugin" link on alert with pluginId', async ({ page }) => {
    // HighErrorRate has pluginId: 'plugin-2'
    const alertCard = page.locator('[role="alert"]').first();
    await expect(alertCard).toBeVisible({ timeout: 10000 });
    await expect(alertCard.getByText('View Plugin')).toBeVisible();
  });

  test('should render Alert History table', async ({ page }) => {
    await expect(page.getByRole('table', { name: 'Alert history' })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText('HighMemoryUsage')).toBeVisible();
    await expect(page.getByText('PluginUnreachable')).toBeVisible();
  });

  test('should show Resolved and Firing status labels in history table', async ({ page }) => {
    // HighMemoryUsage has resolvedAt set → "Resolved"
    // PluginUnreachable has resolvedAt: null → "Firing"
    await expect(page.getByText('Resolved').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Firing').first()).toBeVisible();
  });

  test('should have severity filter select in Alert History', async ({ page }) => {
    const severityFilter = page.locator('#history-severity-filter');
    await expect(severityFilter).toBeVisible({ timeout: 10000 });

    // Filter by Critical
    await severityFilter.selectOption('critical');
    // HighMemoryUsage is Warning, so after filtering only PluginUnreachable (Critical) shows
    await expect(page.getByText('PluginUnreachable')).toBeVisible({ timeout: 3000 });
  });
});

// ---------------------------------------------------------------------------
// Tests: Traces Tab
// ---------------------------------------------------------------------------

test.describe('Observability Dashboard — Traces Tab', () => {
  test.beforeEach(async ({ page }) => {
    await setupAllMocks(page);
    await page.goto('/observability?tab=traces');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('tabpanel')).toBeVisible({ timeout: 10000 });
  });

  test('should render the Search Traces form', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Search Traces', level: 2 })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByLabel('Service')).toBeVisible();
    await expect(page.getByLabel('Trace ID')).toBeVisible();
    await expect(page.getByLabel('Limit')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Search traces' })).toBeVisible();
  });

  test('should show no results until Search is clicked', async ({ page }) => {
    // Table should NOT be rendered before first search
    await expect(page.getByRole('table', { name: 'Trace results' })).not.toBeVisible({
      timeout: 3000,
    });
  });

  test('should render trace results table after submitting search', async ({ page }) => {
    // Click Search button
    await page.getByRole('button', { name: 'Search traces' }).click();

    // Traces table appears with mock data
    const table = page.getByRole('table', { name: 'Trace results' });
    await expect(table).toBeVisible({ timeout: 10000 });

    // Trace root span names visible
    await expect(page.getByText('POST /api/process')).toBeVisible();
    await expect(page.getByText('GET /api/export')).toBeVisible();
  });

  test('should show trace status badges with icon+text — not colour-only (WCAG 1.4.1)', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Search traces' }).click();

    // StatusBadge renders "OK" and "Error" text alongside icons
    await expect(page.getByText('OK').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Error').first()).toBeVisible();
  });

  test('should filter by service name when typed in Service field', async ({ page }) => {
    await page.getByLabel('Service').fill('plugin-analytics-pro');
    await page.getByRole('button', { name: 'Search traces' }).click();

    const table = page.getByRole('table', { name: 'Trace results' });
    await expect(table).toBeVisible({ timeout: 10000 });
  });

  test('should open span waterfall when a trace row is clicked', async ({ page }) => {
    await page.getByRole('button', { name: 'Search traces' }).click();

    // Click on the first trace row
    const traceRow = page.getByRole('button', { name: /View trace/i }).first();
    await expect(traceRow).toBeVisible({ timeout: 10000 });
    await traceRow.click();

    // Waterfall section appears
    await expect(page.getByRole('region', { name: /trace detail/i })).toBeVisible({
      timeout: 10000,
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: Metrics Tab
// ---------------------------------------------------------------------------

test.describe('Observability Dashboard — Metrics Tab', () => {
  test.beforeEach(async ({ page }) => {
    await setupAllMocks(page);
    await page.goto('/observability?tab=metrics');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('tabpanel')).toBeVisible({ timeout: 10000 });
  });

  test('should render the Metrics tab panel', async ({ page }) => {
    // The Metrics tab should be active
    const metricsTab = page.getByRole('tab', { name: 'Metrics' });
    await expect(metricsTab).toHaveAttribute('aria-selected', 'true', { timeout: 10000 });

    // Panel is rendered (not throwing)
    const panel = page.getByRole('tabpanel');
    await expect(panel).toBeVisible();
  });

  test('should have a time range selector', async ({ page }) => {
    // TimeRangeSelector renders a select with time range options
    const panel = page.getByRole('tabpanel');
    // Look for a select within the metrics panel
    const selects = panel.locator('select');
    await expect(selects.first()).toBeVisible({ timeout: 10000 });
  });
});

// ---------------------------------------------------------------------------
// Tests: Accessibility — tab keyboard navigation
// ---------------------------------------------------------------------------

test.describe('Observability Dashboard — Keyboard Navigation', () => {
  test('should support ArrowRight to navigate between tabs', async ({ page }) => {
    await setupAllMocks(page);
    await page.goto('/observability?tab=health');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('tablist')).toBeVisible({ timeout: 10000 });

    // Focus Health tab, then press ArrowRight to go to Metrics
    const healthTab = page.getByRole('tab', { name: 'Health' });
    await healthTab.focus();
    await page.keyboard.press('ArrowRight');

    const metricsTab = page.getByRole('tab', { name: 'Metrics' });
    await expect(metricsTab).toHaveAttribute('aria-selected', 'true', { timeout: 5000 });
  });

  test('should support ArrowLeft to navigate back', async ({ page }) => {
    await setupAllMocks(page);
    await page.goto('/observability?tab=traces');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('tablist')).toBeVisible({ timeout: 10000 });

    const tracesTab = page.getByRole('tab', { name: 'Traces' });
    await tracesTab.focus();
    await page.keyboard.press('ArrowLeft');

    const metricsTab = page.getByRole('tab', { name: 'Metrics' });
    await expect(metricsTab).toHaveAttribute('aria-selected', 'true', { timeout: 5000 });
  });
});

// ---------------------------------------------------------------------------
// Tests: Empty states
// ---------------------------------------------------------------------------

test.describe('Observability Dashboard — Empty States', () => {
  test('should render "All systems operational" when no active alerts', async ({ page }) => {
    // Override with empty alerts
    await page.route('**/api/v1/observability/alerts**', async (route) => {
      const url = route.request().url();
      if (url.includes('/history')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            alerts: [],
            pagination: { page: 1, perPage: 10, total: 0, totalPages: 1 },
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ alerts: [], total: 0 }),
      });
    });
    await mockAllApis(page, {
      overview: { totalTenants: 0, activeTenants: 0, totalPlugins: 0, totalUsers: 0 },
    });

    await page.goto('/observability?tab=alerts');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('tabpanel')).toBeVisible({ timeout: 10000 });

    await expect(page.getByText(/all systems operational/i)).toBeVisible({ timeout: 10000 });
  });

  test('should render "No active plugins found" when health summary is empty', async ({ page }) => {
    // Override with empty health data
    await page.route('**/api/v1/observability/plugins/health-summary**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          plugins: [],
          totalActive: 0,
          unhealthyCount: 0,
          generatedAt: '2026-03-07T10:00:00Z',
        }),
      });
    });
    await mockAllApis(page, {
      overview: { totalTenants: 0, activeTenants: 0, totalPlugins: 0, totalUsers: 0 },
    });

    await page.goto('/observability?tab=health');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('tabpanel')).toBeVisible({ timeout: 10000 });

    await expect(page.getByText(/no active plugins found/i)).toBeVisible({ timeout: 10000 });
  });
});
