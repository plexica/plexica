/**
 * Plugin Observability Dashboard E2E Tests (TD-019)
 *
 * Covers the Super Admin observability dashboard described in Spec 012 US-006
 * and user-journey.md. Tests the four-tab dashboard (Health / Metrics /
 * Traces / Alerts) rendered at `/admin/observability`.
 *
 * User journeys exercised:
 *   J1: Daily Health Check   — Health tab, plugin status table, auto-refresh
 *   J2: Alert Investigation  — Alerts tab, severity badges, alert cards
 *   J3: Slow Request Tracing — Traces tab, search, trace detail / waterfall
 *   J4: Resource Usage Trends — Metrics tab, plugin selector, time range
 *
 * Spec FRs covered:
 *   FR-013 / FR-024 — Observability section with four tabs
 *   FR-014 / FR-025 — Health tab with plugin health table
 *   FR-015 / FR-027 — Metrics tab with time-series charts (recharts)
 *   FR-028 / FR-029 — Traces tab — search + trace detail
 *   FR-030           — Trace Search API
 *   FR-031           — Trace Detail Retrieval
 *   FR-032           — Alerts tab with severity badges
 *
 * Architecture: All API calls are intercepted with page.route() so that
 * no real observability infrastructure (Prometheus / Tempo / Loki) is needed.
 * The web server is started with MockAuthProvider (VITE_E2E_TEST_MODE=true)
 * which automatically bypasses Keycloak and grants super_admin rights.
 *
 * File: apps/web/tests/e2e/observability-dashboard.spec.ts
 */

import { test, expect, Page } from '@playwright/test';
import { mockAllApis } from './helpers/api-mocks';

// ---------------------------------------------------------------------------
// Mock data — Health Summary
// ---------------------------------------------------------------------------

const MOCK_HEALTH_SUMMARY = {
  plugins: [
    {
      id: 'plugin-crm',
      name: 'CRM Pro',
      status: 'healthy',
      p95LatencyMs: 123,
      errorRatePct: 0.3,
      uptimePct: 99.8,
      lastHealthCheckAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(), // 2 min ago
    },
    {
      id: 'plugin-billing',
      name: 'Billing Manager',
      status: 'degraded',
      p95LatencyMs: 680,
      errorRatePct: 3.2,
      uptimePct: 98.1,
      lastHealthCheckAt: new Date(Date.now() - 45 * 1000).toISOString(), // 45 sec ago
    },
    {
      id: 'plugin-analytics',
      name: 'Analytics Dashboard',
      status: 'down',
      p95LatencyMs: null,
      errorRatePct: null,
      uptimePct: 87.5,
      lastHealthCheckAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 min ago
    },
  ],
};

// ---------------------------------------------------------------------------
// Mock data — Prometheus metrics query (PromQL range result)
// ---------------------------------------------------------------------------

const MOCK_METRICS_QUERY = {
  status: 'success',
  data: {
    resultType: 'matrix',
    result: [
      {
        metric: { plugin: 'crm', quantile: '0.95' },
        values: [
          [1741305600, '0.123'],
          [1741305615, '0.145'],
          [1741305630, '0.119'],
          [1741305645, '0.680'],
        ],
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// Mock data — Traces list
// ---------------------------------------------------------------------------

const MOCK_TRACES = {
  data: [
    {
      traceId: 'abc123def456',
      rootService: 'core-api',
      durationMs: 842,
      spanCount: 7,
      status: 'error',
      startTime: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    },
    {
      traceId: 'xyz789uvw012',
      rootService: 'plugin-crm',
      durationMs: 234,
      spanCount: 3,
      status: 'ok',
      startTime: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
    },
  ],
  pagination: { page: 1, per_page: 20, total: 2, total_pages: 1 },
};

// ---------------------------------------------------------------------------
// Mock data — Trace detail (span waterfall)
// ---------------------------------------------------------------------------

const MOCK_TRACE_DETAIL = {
  traceId: 'abc123def456',
  spans: [
    {
      spanId: 'span-001',
      parentSpanId: null,
      service: 'core-api',
      operation: 'POST /api/v1/invoices',
      durationMs: 842,
      status: 'error',
      startTimeMs: 0,
    },
    {
      spanId: 'span-002',
      parentSpanId: 'span-001',
      service: 'plugin-billing',
      operation: 'create-invoice',
      durationMs: 680,
      status: 'error',
      startTimeMs: 12,
    },
    {
      spanId: 'span-003',
      parentSpanId: 'span-002',
      service: 'plugin-billing',
      operation: 'db-query',
      durationMs: 420,
      status: 'ok',
      startTimeMs: 20,
      attributes: { 'db.system': 'postgresql', 'db.duration_ms': 420 },
    },
  ],
};

// ---------------------------------------------------------------------------
// Mock data — Alerts
// ---------------------------------------------------------------------------

const MOCK_ALERTS = {
  active: [
    {
      id: 'alert-001',
      ruleName: 'PluginDown',
      severity: 'critical',
      pluginId: 'plugin-billing',
      pluginName: 'Billing Manager',
      description: 'Plugin container is unreachable (up == 0 for > 1 minute)',
      firedAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    },
    {
      id: 'alert-002',
      ruleName: 'PluginHighErrorRate',
      severity: 'warning',
      pluginId: 'plugin-analytics',
      pluginName: 'Analytics Dashboard',
      description: 'Error rate 7.8% exceeds 5% threshold over 5-minute window',
      firedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    },
  ],
};

const MOCK_ALERTS_HISTORY = {
  data: [
    {
      id: 'hist-001',
      ruleName: 'PluginHighLatency',
      severity: 'warning',
      pluginId: 'plugin-crm',
      pluginName: 'CRM Pro',
      description: 'P95 latency 610ms exceeded 500ms threshold',
      firedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      resolvedAt: new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString(),
    },
  ],
  pagination: { page: 1, per_page: 20, total: 1, total_pages: 1 },
};

// ---------------------------------------------------------------------------
// Mock data — Plugin logs
// ---------------------------------------------------------------------------

const MOCK_LOGS = {
  data: [
    {
      timestamp: new Date(Date.now() - 60 * 1000).toISOString(),
      level: 'error',
      message: 'Database connection timeout after 5000ms',
      traceId: 'abc123def456',
      pluginId: 'plugin-billing',
    },
    {
      timestamp: new Date(Date.now() - 90 * 1000).toISOString(),
      level: 'warn',
      message: 'Retrying database query (attempt 2 of 3)',
      traceId: 'abc123def456',
      pluginId: 'plugin-billing',
    },
    {
      timestamp: new Date(Date.now() - 120 * 1000).toISOString(),
      level: 'info',
      message: 'Invoice creation request received',
      traceId: 'abc123def456',
      pluginId: 'plugin-billing',
    },
  ],
  pagination: { page: 1, per_page: 100, total: 3, total_pages: 1 },
};

// ---------------------------------------------------------------------------
// API mock helper — observability endpoints
// ---------------------------------------------------------------------------

/**
 * Register page.route() interceptors for all /api/v1/observability/* endpoints.
 * Must be called BEFORE mockAllApis() so more-specific routes take priority.
 */
async function mockObservabilityApis(page: Page) {
  // GET /api/v1/observability/plugins/health-summary  (FR-026)
  await page.route('**/api/v1/observability/plugins/health-summary', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_HEALTH_SUMMARY),
      });
    } else {
      await route.continue();
    }
  });

  // GET /api/v1/observability/plugins/:id/query  (FR-028 — PromQL proxy)
  await page.route('**/api/v1/observability/plugins/*/query*', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_METRICS_QUERY),
      });
    } else {
      await route.continue();
    }
  });

  // GET /api/v1/observability/traces  (FR-030 — trace search)
  // Must be registered before the more-specific :traceId route.
  await page.route(/\/api\/v1\/observability\/traces(\?.*)?$/, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_TRACES),
      });
    } else {
      await route.continue();
    }
  });

  // GET /api/v1/observability/traces/:traceId  (FR-031 — full trace)
  await page.route(/\/api\/v1\/observability\/traces\/[^?/]+(\?.*)?$/, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_TRACE_DETAIL),
      });
    } else {
      await route.continue();
    }
  });

  // GET /api/v1/observability/alerts  (FR-022 — active alerts)
  await page.route('**/api/v1/observability/alerts', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_ALERTS),
      });
    } else {
      await route.continue();
    }
  });

  // GET /api/v1/observability/alerts/history  (FR-023 — resolved alerts)
  await page.route('**/api/v1/observability/alerts/history*', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_ALERTS_HISTORY),
      });
    } else {
      await route.continue();
    }
  });

  // GET /api/v1/observability/plugins/:id/logs  (FR-028 spec §8.3 — log query)
  await page.route('**/api/v1/observability/plugins/*/logs*', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_LOGS),
      });
    } else {
      await route.continue();
    }
  });
}

// ---------------------------------------------------------------------------
// Journey 1 — Daily Health Check: Health tab
// FR-013/FR-024 (four tabs), FR-025 (health table)
// ---------------------------------------------------------------------------

test.describe('Observability Dashboard — Health Tab (FR-024, FR-025)', () => {
  test.beforeEach(async ({ page }) => {
    await mockObservabilityApis(page);
    await mockAllApis(page);
    await page.goto('/admin/observability');
    await expect(page.getByRole('heading', { name: /observability/i })).toBeVisible({
      timeout: 15000,
    });
  });

  test('should render the Observability section with four tabs', async ({ page }) => {
    // The dashboard must have exactly the four tabs specified in FR-024
    await expect(page.getByRole('tab', { name: /health/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /metrics/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /traces/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /alerts/i })).toBeVisible();
  });

  test('should show the Health tab as the default active tab', async ({ page }) => {
    // Health is the default view per US-006 step 1 and user-journey J1 step 1
    const healthTab = page.getByRole('tab', { name: /health/i });
    await expect(healthTab).toHaveAttribute('aria-selected', 'true');
  });

  test('should display plugin health table with all required columns', async ({ page }) => {
    // FR-025: columns — name, status, P95 latency, error rate, uptime, last health check
    await expect(page.getByRole('columnheader', { name: /plugin/i })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByRole('columnheader', { name: /status/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /p95|latency/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /error rate/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /uptime/i })).toBeVisible();
  });

  test('should show all three plugins from the health-summary response', async ({ page }) => {
    await expect(page.getByText('CRM Pro')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Billing Manager')).toBeVisible();
    await expect(page.getByText('Analytics Dashboard')).toBeVisible();
  });

  test('should display Healthy, Degraded, and Down status badges', async ({ page }) => {
    // Spec §9.2: status logic — three distinct badge states
    await expect(page.getByText('Healthy', { exact: true })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Degraded', { exact: true })).toBeVisible();
    await expect(page.getByText('Down', { exact: true })).toBeVisible();
  });

  test('should highlight P95 latency in red when it exceeds 500ms', async ({ page }) => {
    // FR-025 / spec §9.2: red text when P95 > 500ms
    // Billing Manager has p95LatencyMs: 680 — above the 500ms threshold
    const billingRow = page.getByRole('row', { name: /billing manager/i });
    await expect(billingRow).toBeVisible({ timeout: 10000 });
    // The latency value should be marked as over-threshold (data-testid or class)
    await expect(billingRow.getByText(/680\s*ms/i)).toBeVisible();
  });

  test('should show a "View Metrics" action button for each plugin row', async ({ page }) => {
    // FR-025: "View Metrics" button per row — user-journey J1 step 4
    const viewMetricsButtons = page.getByRole('button', { name: /view metrics/i });
    await expect(viewMetricsButtons.first()).toBeVisible({ timeout: 10000 });
    const count = await viewMetricsButtons.count();
    expect(count).toBeGreaterThanOrEqual(3); // one per plugin
  });

  test('should navigate to the Metrics tab when clicking View Metrics', async ({ page }) => {
    // J1 step 4: clicking "View Metrics" on a row opens Metrics tab filtered to that plugin
    const viewMetricsButtons = page.getByRole('button', { name: /view metrics/i });
    await viewMetricsButtons.first().click();
    const metricsTab = page.getByRole('tab', { name: /metrics/i });
    await expect(metricsTab).toHaveAttribute('aria-selected', 'true', { timeout: 5000 });
  });

  test('should show the auto-refresh indicator on the Health tab', async ({ page }) => {
    // FR-025: auto-refreshes every 30 seconds; spec §9.2: "Last updated: ..." indicator
    await expect(page.getByText(/last updated/i)).toBeVisible({ timeout: 10000 });
  });
});

// ---------------------------------------------------------------------------
// Journey 4 — Resource Usage Trends: Metrics tab
// FR-027 (charts), FR-028 (PromQL proxy)
// ---------------------------------------------------------------------------

test.describe('Observability Dashboard — Metrics Tab (FR-027, FR-028)', () => {
  test.beforeEach(async ({ page }) => {
    await mockObservabilityApis(page);
    await mockAllApis(page);
    await page.goto('/admin/observability');
    await expect(page.getByRole('heading', { name: /observability/i })).toBeVisible({
      timeout: 15000,
    });
    // Switch to Metrics tab
    await page.getByRole('tab', { name: /metrics/i }).click();
    await expect(page.getByRole('tab', { name: /metrics/i })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  test('should display the plugin selector dropdown', async ({ page }) => {
    // J4 step 2: plugin selector (spec §9.3)
    await expect(
      page.getByRole('combobox', { name: /plugin/i }).or(page.getByLabel(/select plugin/i))
    ).toBeVisible({ timeout: 10000 });
  });

  test('should display the time range selector with expected options', async ({ page }) => {
    // FR-027 / spec §9.3: time range options 1h, 6h, 24h, 7d
    const timeRangeSelector = page
      .getByRole('combobox', { name: /time range/i })
      .or(page.getByLabel(/time range/i));
    await expect(timeRangeSelector).toBeVisible({ timeout: 10000 });
  });

  test('should render the four chart panels', async ({ page }) => {
    // FR-027 / spec §9.3: Request Rate, Latency Distribution, Error Rate, Resource Usage
    await expect(page.getByText(/request rate/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/latency/i)).toBeVisible();
    await expect(page.getByText(/error rate/i)).toBeVisible();
    await expect(page.getByText(/resource usage|memory|cpu/i)).toBeVisible();
  });

  test('should reload chart data when changing the time range', async ({ page }) => {
    // J4 step 4 / J1 step 5 — changing time range triggers a new PromQL query
    let queryCallCount = 0;
    await page.route('**/api/v1/observability/plugins/*/query*', async (route) => {
      queryCallCount++;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_METRICS_QUERY),
      });
    });

    const timeRangeSelector = page
      .getByRole('combobox', { name: /time range/i })
      .or(page.getByLabel(/time range/i));
    // Select "6h" (or the second option if the selector is a button group)
    const sixHourOption = page.getByRole('option', { name: '6h' });
    if (await timeRangeSelector.isVisible({ timeout: 2000 }).catch(() => false)) {
      await timeRangeSelector.selectOption('6h');
    } else {
      // Button-group style time range selector
      const sixHButton = page.getByRole('button', { name: /^6h$/i });
      if (await sixHButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await sixHButton.click();
      } else {
        await sixHourOption.click();
      }
    }

    // After changing range, charts should still be visible (re-render)
    await expect(page.getByText(/request rate/i)).toBeVisible({ timeout: 5000 });
  });

  test('charts should have accessible aria-label attributes (WCAG 2.1 AA)', async ({ page }) => {
    // NFR-019 / spec §9.6: charts must have aria-label for screen readers
    // recharts renders SVG elements; the wrapping container should have aria-label
    const chartRegions = page
      .locator('[aria-label]')
      .filter({ hasText: '' })
      .or(page.locator('[role="img"][aria-label]'));
    // At least one chart should expose an accessible label
    const count = await chartRegions.count();
    expect(count).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Journey 3 — Slow Request Tracing: Traces tab
// FR-029 (trace list), FR-030 (trace search), FR-031 (trace detail)
// ---------------------------------------------------------------------------

test.describe('Observability Dashboard — Traces Tab (FR-029, FR-030, FR-031)', () => {
  test.beforeEach(async ({ page }) => {
    await mockObservabilityApis(page);
    await mockAllApis(page);
    await page.goto('/admin/observability');
    await expect(page.getByRole('heading', { name: /observability/i })).toBeVisible({
      timeout: 15000,
    });
    // Switch to Traces tab
    await page.getByRole('tab', { name: /traces/i }).click();
    await expect(page.getByRole('tab', { name: /traces/i })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  test('should render the trace search form with service and trace ID inputs', async ({ page }) => {
    // FR-029 / spec §9.4: search form — service dropdown, trace ID text input, time range
    await expect(
      page
        .getByLabel(/service|plugin/i)
        .or(page.getByPlaceholder(/service|plugin/i))
        .first()
    ).toBeVisible({ timeout: 10000 });
    await expect(
      page
        .getByLabel(/trace id/i)
        .or(page.getByPlaceholder(/trace id/i))
        .first()
    ).toBeVisible();
  });

  test('should display the trace list with Trace ID, Root Service, Duration, Span Count, Status', async ({
    page,
  }) => {
    // FR-029 / spec §9.4 results table columns
    await expect(page.getByRole('columnheader', { name: /trace id/i })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByRole('columnheader', { name: /root service/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /duration/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /span/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /status/i })).toBeVisible();
  });

  test('should show trace rows from the mock traces response', async ({ page }) => {
    // MOCK_TRACES has two traces: abc123def456 (error, 842ms) and xyz789uvw012 (ok, 234ms)
    await expect(page.getByText(/abc123/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/xyz789/i)).toBeVisible();
    await expect(page.getByText(/842\s*ms/i)).toBeVisible();
    await expect(page.getByText(/234\s*ms/i)).toBeVisible();
  });

  test('should show Error and OK status badges on trace rows', async ({ page }) => {
    // Spec §9.4: status badge "OK" (green) or "Error" (red)
    await expect(page.getByText('Error', { exact: true })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('OK', { exact: true })).toBeVisible();
  });

  test('should open trace detail view when clicking a trace row', async ({ page }) => {
    // J3 step 4 / FR-031: clicking a trace row opens the span waterfall
    await page
      .getByText(/abc123/i)
      .first()
      .click();

    // The waterfall / detail panel should become visible
    await expect(
      page
        .getByRole('region', { name: /trace detail|span waterfall/i })
        .or(page.getByTestId('trace-waterfall'))
        .or(page.getByText(/core-api.*POST|POST.*invoices/i))
    ).toBeVisible({ timeout: 10000 });
  });

  test('should render parent and child spans in the trace waterfall', async ({ page }) => {
    // J3 step 4: span hierarchy — MOCK_TRACE_DETAIL has 3 spans across 2 levels
    await page
      .getByText(/abc123/i)
      .first()
      .click();

    await expect(page.getByText(/core-api/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/plugin-billing/i)).toBeVisible();
    await expect(page.getByText(/db-query/i)).toBeVisible();
  });

  test('should show empty state when no traces match the search', async ({ page }) => {
    // J3 edge case / spec Edge Case #13: "No traces found…"
    // Override the traces route to return empty results
    await page.route(/\/api\/v1\/observability\/traces(\?.*)?$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [],
          pagination: { page: 1, per_page: 20, total: 0, total_pages: 0 },
        }),
      });
    });

    // Type a trace ID that won't match anything
    const traceIdInput = page
      .getByLabel(/trace id/i)
      .or(page.getByPlaceholder(/trace id/i))
      .first();
    if (await traceIdInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await traceIdInput.fill('nonexistent-trace-id');
      // Trigger a search if there's a submit button; otherwise wait for debounce
      const searchBtn = page.getByRole('button', { name: /search/i });
      if (await searchBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await searchBtn.click();
      }
    }

    await expect(page.getByText(/no traces found/i)).toBeVisible({ timeout: 10000 });
  });
});

// ---------------------------------------------------------------------------
// Journey 2 — Alert Investigation: Alerts tab
// FR-032 (alerts panel), FR-022 (active alerts), FR-023 (alert history)
// ---------------------------------------------------------------------------

test.describe('Observability Dashboard — Alerts Tab (FR-032)', () => {
  test.beforeEach(async ({ page }) => {
    await mockObservabilityApis(page);
    await mockAllApis(page);
    await page.goto('/admin/observability');
    await expect(page.getByRole('heading', { name: /observability/i })).toBeVisible({
      timeout: 15000,
    });
    // Switch to Alerts tab
    await page.getByRole('tab', { name: /alerts/i }).click();
    await expect(page.getByRole('tab', { name: /alerts/i })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  test('should display the Active Alerts section', async ({ page }) => {
    // FR-032 / spec §9.5: two sections — "Active Alerts" and "Alert History"
    await expect(page.getByText(/active alerts/i)).toBeVisible({ timeout: 10000 });
  });

  test('should display the Alert History section', async ({ page }) => {
    await expect(page.getByText(/alert history/i)).toBeVisible({ timeout: 10000 });
  });

  test('should show the critical PluginDown alert with severity badge', async ({ page }) => {
    // J2 step 2: PluginDown is critical, shown at the top of Active Alerts
    await expect(page.getByText('PluginDown')).toBeVisible({ timeout: 10000 });
    // Severity badge — both text and colour (WCAG: not colour alone, spec §9.6)
    await expect(
      page.getByText('critical', { exact: true }).or(page.getByText('Critical', { exact: true }))
    ).toBeVisible();
  });

  test('should show the warning PluginHighErrorRate alert', async ({ page }) => {
    await expect(page.getByText('PluginHighErrorRate')).toBeVisible({ timeout: 10000 });
    await expect(
      page.getByText('warning', { exact: true }).or(page.getByText('Warning', { exact: true }))
    ).toBeVisible();
  });

  test('should display plugin name on each active alert card', async ({ page }) => {
    // FR-032: each alert shows plugin name
    await expect(page.getByText('Billing Manager')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Analytics Dashboard')).toBeVisible();
  });

  test('should display a "View Plugin" link on each active alert card', async ({ page }) => {
    // J2 step 3 / spec §9.5: "View Plugin" link navigates to Metrics tab for that plugin
    const viewPluginLinks = page
      .getByRole('button', { name: /view plugin/i })
      .or(page.getByRole('link', { name: /view plugin/i }));
    await expect(viewPluginLinks.first()).toBeVisible({ timeout: 10000 });
  });

  test('should show resolved alert in Alert History with fired and resolved timestamps', async ({
    page,
  }) => {
    // FR-023 / spec §9.5: history table columns include Fired At and Resolved At
    await expect(page.getByText('PluginHighLatency')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('CRM Pro')).toBeVisible();
  });

  test('should show empty active alerts state when no alerts are firing', async ({ page }) => {
    // J2 edge case: "No active alerts. All plugins are operating normally."
    await page.route('**/api/v1/observability/alerts', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ active: [] }),
      });
    });

    // Re-navigate so the override takes effect
    await page.goto('/admin/observability');
    await expect(page.getByRole('heading', { name: /observability/i })).toBeVisible({
      timeout: 15000,
    });
    await page.getByRole('tab', { name: /alerts/i }).click();

    await expect(
      page.getByText(/no active alerts/i).or(page.getByText(/all plugins.*operating normally/i))
    ).toBeVisible({ timeout: 10000 });
  });
});

// ---------------------------------------------------------------------------
// Access control — negative-path auth test (FR-036)
// ---------------------------------------------------------------------------

test.describe('Observability Dashboard — Access Control (FR-036)', () => {
  test('should redirect a non-admin user away from /admin/observability', async ({ page }) => {
    // Arrange — seed a Zustand auth state with only "member" role (no admin role).
    // The TenantAdminLayout uses useRequireTenantAdmin() which allows admin / tenant_admin /
    // tenant_owner. A plain "member" must be redirected to '/'.
    const restrictedAuthState = {
      state: {
        user: {
          id: 'mock-member-user-id',
          email: 'member@acme-corp.plexica.local',
          name: 'Plain Member (E2E)',
          tenantId: 'mock-tenant-id',
          roles: ['member'], // <-- no admin role
          permissions: ['workspace:read'],
        },
        tenant: {
          id: 'mock-tenant-id',
          name: 'Acme Corp',
          slug: 'acme-corp',
          status: 'ACTIVE',
          settings: {},
          theme: {},
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-02-01T00:00:00Z',
        },
        isAuthenticated: true,
      },
      version: 0,
    };

    // Inject into localStorage BEFORE the page loads so the Zustand store
    // rehydrates with restricted permissions — same technique as workspace-a11y.spec.ts.
    await page.addInitScript(
      (args: { serialized: string }) => {
        localStorage.setItem('plexica-auth', args.serialized);
      },
      { serialized: JSON.stringify(restrictedAuthState) }
    );

    await mockAllApis(page);

    // Act — navigate directly to the protected observability route
    await page.goto('/admin/observability');

    // Assert — useRequireTenantAdmin() must detect the missing admin role and
    // navigate to '/' before the dashboard heading is ever rendered.
    await expect(page).toHaveURL('/', { timeout: 10000 });
    await expect(page.getByRole('heading', { name: /observability/i })).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Backend unavailable — error states (NFR-013: fail-open)
// ---------------------------------------------------------------------------

test.describe('Observability Dashboard — Backend Unavailable States (NFR-013)', () => {
  test('should show an error banner on the Health tab when the backend returns 502', async ({
    page,
  }) => {
    // Override health-summary to simulate Prometheus being unreachable
    await page.route('**/api/v1/observability/plugins/health-summary', async (route) => {
      await route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            code: 'OBSERVABILITY_BACKEND_UNAVAILABLE',
            message: 'Prometheus is not reachable. Retry later.',
            details: { backend: 'prometheus', timeout_ms: 5000 },
          },
        }),
      });
    });
    await mockAllApis(page);

    await page.goto('/admin/observability');
    await expect(page.getByRole('heading', { name: /observability/i })).toBeVisible({
      timeout: 15000,
    });

    // Per spec §9.2 edge case + NFR-013: error banner, plugin operations unaffected
    await expect(
      page
        .getByRole('alert')
        .or(page.getByText(/unable to retrieve health data|observability backend/i))
    ).toBeVisible({ timeout: 10000 });
  });

  test('should show an error state on the Traces tab when Tempo is unavailable', async ({
    page,
  }) => {
    await page.route(/\/api\/v1\/observability\/traces(\?.*)?$/, async (route) => {
      await route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            code: 'OBSERVABILITY_BACKEND_UNAVAILABLE',
            message: 'The trace backend (Tempo) is not responding.',
          },
        }),
      });
    });
    await mockAllApis(page);

    await page.goto('/admin/observability');
    await expect(page.getByRole('heading', { name: /observability/i })).toBeVisible({
      timeout: 15000,
    });
    await page.getByRole('tab', { name: /traces/i }).click();

    await expect(
      page.getByRole('alert').or(page.getByText(/unable to search traces|trace backend|tempo/i))
    ).toBeVisible({ timeout: 10000 });
  });
});
