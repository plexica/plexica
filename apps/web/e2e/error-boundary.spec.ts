// error-boundary.spec.ts
// E2E test: RouteErrorBoundary catches component errors and shows fallback UI.
// Verifies AppShell remains intact and navigation resets the boundary.
//
// M-6 fix: updated to use the dev-only /test-error route (TestErrorPage throws
// intentionally) instead of the org-error page, which never triggered the
// RouteErrorBoundary at all. This test now verifies feature 002-16 correctly.
//
// Requires PLAYWRIGHT_TEST_USER + PLAYWRIGHT_TEST_PASSWORD + PLAYWRIGHT_TENANT_SLUG
// (and a valid Keycloak realm for that tenant). Skips gracefully when absent.

import { expect, test } from './helpers/base-fixture.js';
import { requireKeycloakInCI } from './helpers/keycloak-login.js';

const TEST_USER = process.env['PLAYWRIGHT_TEST_USER'] ?? '';
const TEST_PASSWORD = process.env['PLAYWRIGHT_TEST_PASSWORD'] ?? '';
const TENANT_SLUG = process.env['PLAYWRIGHT_TENANT_SLUG'] ?? 'test-tenant';

const hasTestCredentials = TEST_USER.length > 0 && TEST_PASSWORD.length > 0;

// Helper: log in and navigate to a protected route
async function loginAndGoTo(page: import('@playwright/test').Page, path: string): Promise<void> {
  // Include ?tenant= so the root loader can resolve the tenant.
  // Without it the root loader throws no-subdomain and redirects to org-error
  // before AuthGuard ever gets a chance to redirect to Keycloak.
  await page.goto('/?tenant=' + TENANT_SLUG);
  // Wait for Keycloak login redirect
  await page.waitForURL(/\/realms\//, { timeout: 10_000 });
  await page.getByLabel(/email|username/i).fill(TEST_USER);
  await page.locator('input[name="password"]').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await page.waitForURL(`**${path}`, { timeout: 15_000 });
}

test.describe('Error boundary (M-6)', () => {
  test.skip(
    !hasTestCredentials,
    'Requires PLAYWRIGHT_TEST_USER and PLAYWRIGHT_TEST_PASSWORD to be set'
  );

  test.beforeAll(() => {
    requireKeycloakInCI();
  });

  test('RouteErrorBoundary catches render error and shows fallback UI', async ({ page }) => {
    await loginAndGoTo(page, '/dashboard');

    // Navigate to the dev-only /test-error route — TestErrorPage throws on render
    await page.goto('/test-error');

    // ErrorFallback must be shown with role="alert"
    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible({ timeout: 5_000 });
    await expect(alert).toContainText(/something went wrong/i);
  });

  test('AppShell (sidebar + header) remains visible after component error', async ({ page }) => {
    await loginAndGoTo(page, '/dashboard');
    await page.goto('/test-error');

    // Sidebar and header must still be rendered — only the main content area crashed
    await expect(page.getByRole('banner')).toBeVisible({ timeout: 5_000 }); // <header>
    await expect(page.getByRole('navigation').first()).toBeVisible(); // sidebar
  });

  test('error fallback does not expose stack trace or internal paths', async ({ page }) => {
    await loginAndGoTo(page, '/dashboard');
    await page.goto('/test-error');

    await page.getByRole('alert').waitFor({ timeout: 5_000 });
    const bodyText = (await page.locator('body').textContent()) ?? '';
    expect(bodyText).not.toMatch(/at\s+\w+\s+\(/); // Stack frame pattern
    expect(bodyText).not.toMatch(/node_modules/);
    expect(bodyText).not.toMatch(/\.ts:\d+/);
  });

  test('Go to Dashboard button navigates to /dashboard and resets error boundary', async ({
    page,
  }) => {
    await loginAndGoTo(page, '/dashboard');
    await page.goto('/test-error');

    const dashboardBtn = page.getByRole('link', { name: /go to dashboard/i });
    await expect(dashboardBtn).toBeVisible({ timeout: 5_000 });
    await dashboardBtn.click();

    await page.waitForURL('**/dashboard', { timeout: 10_000 });
    // Wait for the dashboard heading to confirm the error boundary has been reset
    // and DashboardPage has mounted (KeyedErrorBoundary unmounts/remounts on path change).
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 5_000 });
    // After navigation the error boundary should be reset — no alert should be visible
    await expect(page.getByRole('alert')).not.toBeVisible();
  });
});
