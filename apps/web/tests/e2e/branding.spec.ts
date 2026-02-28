/**
 * Branding Settings E2E Tests
 *
 * Tests the Branding tab in the settings page (T005-12).
 * Requires VITE_ENABLE_TENANT_THEMING=true (set via env override in tests).
 *
 * The ENABLE_TENANT_THEMING feature flag is controlled by the
 * VITE_ENABLE_TENANT_THEMING env var. We inject it via page.addInitScript
 * so the tab renders during the test run without a full rebuild.
 *
 * Tests (4):
 *   1. Branding tab is visible when feature flag is on
 *   2. Changing a color updates the live preview
 *   3. Save button calls PATCH /api/v1/tenant/settings
 *   4. Save success message is shown after successful save
 */

import { test, expect } from '@playwright/test';
import { mockAllApis } from './helpers/api-mocks';

// ---------------------------------------------------------------------------
// Helper: enable the ENABLE_TENANT_THEMING flag for a page session
// ---------------------------------------------------------------------------

async function enableTenantTheming(page: import('@playwright/test').Page) {
  // Inject the flag into import.meta.env before any scripts run
  await page.addInitScript(() => {
    // Vitest/Vite replaces import.meta.env at build time; at runtime in
    // Playwright we patch the env object so useFeatureFlag() sees it.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const meta = (window as any).__VITE_META_ENV__ ?? {};
    meta['VITE_ENABLE_TENANT_THEMING'] = 'true';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__VITE_META_ENV__ = meta;

    // Also patch import.meta.env directly (works in test mode builds)
    try {
      // @ts-expect-error — runtime override
      import.meta.env['VITE_ENABLE_TENANT_THEMING'] = 'true';
    } catch {
      // ignore
    }
  });
}

// ---------------------------------------------------------------------------
// Mock tenant settings endpoint (GET + PATCH)
// ---------------------------------------------------------------------------

async function mockTenantSettingsApi(page: import('@playwright/test').Page) {
  const mockTheme = {
    colors: {
      primary: '#1976d2',
      secondary: '#dc004e',
      background: '#ffffff',
      surface: '#f5f5f5',
      text: '#212121',
      textSecondary: '#757575',
      error: '#f44336',
      success: '#4caf50',
      warning: '#ff9800',
    },
    fonts: { heading: 'Inter', body: 'Inter', mono: 'JetBrains Mono Variable' },
    logo: null,
  };

  await page.route('**/api/v1/tenant/settings', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ settings: { theme: mockTheme } }),
      });
    } else if (route.request().method() === 'PATCH') {
      // Echo back the patched settings
      const body = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ settings: { theme: { ...mockTheme, ...(body?.theme ?? {}) } } }),
      });
    } else {
      await route.continue();
    }
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Branding Settings Tab', () => {
  test.beforeEach(async ({ page }) => {
    await enableTenantTheming(page);
    await mockAllApis(page);
    await mockTenantSettingsApi(page);

    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Workspace Settings' })).toBeVisible({
      timeout: 15000,
    });
  });

  // ── 1. Tab visibility ────────────────────────────────────────────────────

  test('shows Branding tab when ENABLE_TENANT_THEMING flag is on', async ({ page }) => {
    // The Branding tab trigger should be visible in the tab list
    const brandingTab = page.getByRole('tab', { name: 'Branding', exact: true });
    await expect(brandingTab).toBeVisible({ timeout: 5000 });
  });

  // ── 2. Live preview updates on color change ──────────────────────────────

  test('live preview updates when a color is changed', async ({ page }) => {
    // Navigate to branding tab
    await page.getByRole('tab', { name: 'Branding', exact: true }).click();

    // The branding form should be visible
    await expect(page.getByTestId('branding-tab')).toBeVisible({ timeout: 5000 });

    // Get initial preview header background color
    const previewHeader = page.getByTestId('theme-preview-header');
    await expect(previewHeader).toBeVisible();

    // Change primary color via the text input (first color-picker-text)
    const textInputs = page.getByTestId('color-picker-text');
    const primaryTextInput = textInputs.first();
    await primaryTextInput.fill('#ff5500');
    await primaryTextInput.blur();

    // Preview header background should have changed
    // (We check a style attribute change rather than exact pixel color)
    const style = await previewHeader.getAttribute('style');
    expect(style).toContain('#ff5500');
  });

  // ── 3. Save button triggers PATCH ────────────────────────────────────────

  test('clicking Save Changes sends PATCH /api/v1/tenant/settings', async ({ page }) => {
    await page.getByRole('tab', { name: 'Branding', exact: true }).click();
    await expect(page.getByTestId('branding-tab')).toBeVisible({ timeout: 5000 });

    // Track PATCH requests
    const patchRequests: string[] = [];
    page.on('request', (req) => {
      if (req.method() === 'PATCH' && req.url().includes('/api/v1/tenant/settings')) {
        patchRequests.push(req.url());
      }
    });

    await page.getByTestId('branding-save-button').click();

    // Wait for PATCH to be intercepted
    await page.waitForResponse((res) => res.url().includes('/api/v1/tenant/settings'));
    expect(patchRequests.length).toBeGreaterThanOrEqual(1);
  });

  // ── 4. Success message after save ────────────────────────────────────────

  test('shows success message after saving branding settings', async ({ page }) => {
    await page.getByRole('tab', { name: 'Branding', exact: true }).click();
    await expect(page.getByTestId('branding-tab')).toBeVisible({ timeout: 5000 });

    await page.getByTestId('branding-save-button').click();

    await expect(page.getByTestId('branding-save-success')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('branding-save-success')).toContainText(
      'Branding saved successfully'
    );
  });
});
