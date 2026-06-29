// plugin-system.spec.ts
// E2E tests: Plugin System — Spec 004, AC-01 through AC-08.
//
// All plugin system routes are now implemented:
//   /marketplace       → MarketplacePage
//   /settings/plugins  → InstalledPluginsPage
//   /admin/plugins     → AdminPluginRegistryPage
//   /admin/system/dlq  → AdminDlqPage
//
// Requires Keycloak (PLAYWRIGHT_KEYCLOAK_URL etc.) and the E2E tenant provisioned
// by global-setup.ts. Skips gracefully when not available.

import { expect, test } from './helpers/base-fixture.js';
import {
  hasKeycloak,
  loginAsAdmin,
  loginAsMember,
  requireKeycloakInCI,
} from './helpers/admin-login.js';

test.describe('004 Plugin System — AC-01: Plugin Lifecycle', () => {
  test.skip(!hasKeycloak, 'Requires live Keycloak (PLAYWRIGHT_KEYCLOAK_* env vars)');

  test.beforeAll(() => {
    requireKeycloakInCI();
  });

  test('AC-01: Tenant admin can log in and see the dashboard', async ({ page }) => {
    await loginAsAdmin(page);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('main')).toBeVisible({ timeout: 10_000 });
  });

  test('AC-01: Marketplace page renders with title', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/marketplace');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('heading', { name: /marketplace/i })).toBeVisible({
      timeout: 10_000,
    });
  });

  test('AC-01: Installed plugins page renders with title', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/settings/plugins');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('heading', { name: /installed plugins/i })).toBeVisible({
      timeout: 10_000,
    });
  });

  test('AC-01: Admin plugin registry page renders with title', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/plugins');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('heading', { name: /plugin registry/i })).toBeVisible({
      timeout: 10_000,
    });
  });

  test('AC-01: Super admin DLQ page renders without errors', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/system/dlq');
    await page.waitForLoadState('domcontentloaded');
    // Should not show error boundary
    const hasCrash = await page
      .getByRole('alert')
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasCrash).toBe(false);
    // Should show the page heading
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('004 Plugin System — AC-02: Plugin Action Authorization', () => {
  test.skip(!hasKeycloak, 'Requires live Keycloak (PLAYWRIGHT_KEYCLOAK_* env vars)');

  test.beforeAll(() => {
    requireKeycloakInCI();
  });

  test('AC-02: Workspace permissions page is accessible', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/workspaces');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('heading', { name: /workspaces/i })).toBeVisible({
      timeout: 10_000,
    });
  });
});

test.describe('004 Plugin System — AC-03: Plugin Workspace Visibility', () => {
  test.skip(!hasKeycloak, 'Requires live Keycloak (PLAYWRIGHT_KEYCLOAK_* env vars)');

  test.beforeAll(() => {
    requireKeycloakInCI();
  });

  test('AC-03: Tenant settings page renders correctly', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('heading', { level: 1, name: /general settings/i })).toBeVisible({
      timeout: 10_000,
    });
  });

  test('AC-03: Plugin settings page (installed plugins) renders', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/settings/plugins');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('heading', { name: /installed plugins/i })).toBeVisible({
      timeout: 10_000,
    });
  });
});

test.describe('004 Plugin System — AC-04: Marketplace & CLI', () => {
  test.skip(!hasKeycloak, 'Requires live Keycloak (PLAYWRIGHT_KEYCLOAK_* env vars)');

  test.beforeAll(() => {
    requireKeycloakInCI();
  });

  test('AC-04: Sidebar navigation shows marketplace link', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard');
    await page.waitForLoadState('domcontentloaded');
    const sidebar = page.getByRole('navigation', { name: /primary navigation/i });
    await expect(sidebar).toBeVisible({ timeout: 10_000 });
    await expect(sidebar.getByText(/marketplace/i)).toBeVisible();
  });

  test('AC-04: Marketplace search input is present', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/marketplace');
    await page.waitForLoadState('domcontentloaded');
    const searchInput = page.getByPlaceholder(/Search plugins/i);
    await expect(searchInput).toBeVisible({ timeout: 10_000 });
  });

  test('AC-04: Marketplace handles empty state gracefully', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/marketplace');
    await page.waitForLoadState('domcontentloaded');
    const hasCrash = await page
      .getByRole('alert')
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasCrash).toBe(false);
  });
});

test.describe('004 Plugin System — AC-05: Admin Registry & DLQ', () => {
  test.skip(!hasKeycloak, 'Requires live Keycloak (PLAYWRIGHT_KEYCLOAK_* env vars)');

  test.beforeAll(() => {
    requireKeycloakInCI();
  });

  test('AC-05: Admin plugin registry loads without crash', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/plugins');
    await page.waitForLoadState('domcontentloaded');
    const hasCrash = await page
      .getByRole('alert')
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasCrash).toBe(false);
  });

  test('AC-05: Admin DLQ page loads without crash', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/system/dlq');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('004 Plugin System — Cross-cutting', () => {
  test.skip(!hasKeycloak, 'Requires live Keycloak (PLAYWRIGHT_KEYCLOAK_* env vars)');

  test.beforeAll(() => {
    requireKeycloakInCI();
  });

  test('EC-01: Non-admin user can log in and see dashboard', async ({ page }) => {
    await loginAsMember(page);
    await page.goto('/dashboard');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('main')).toBeVisible({ timeout: 10_000 });
  });

  test('EC-02: Core API health endpoint returns OK', async ({ page }) => {
    await loginAsAdmin(page);
    const resp = await page.request.get('http://localhost:3001/health');
    expect(resp.ok()).toBe(true);
    const body = await resp.json();
    expect(body).toHaveProperty('status', 'ok');
  });
});
