/**
 * Automated Accessibility E2E Tests  (T010-36)
 *
 * Uses @axe-core/playwright to run WCAG 2.1 AA automated scans against
 * the running app. Scans catch ~57% of WCAG criteria automatically.
 * Remaining criteria are covered by manual QA (T010-35).
 *
 * ADR-022 Status: ✅ Accepted (@axe-core/playwright is a devDependency)
 * Constitution Art. 1.3: WCAG 2.1 AA compliance required.
 * Constitution Art. 4.1: Test coverage ≥80%.
 *
 * CI policy: tests FAIL on axe `critical` or `serious` violations.
 * `moderate` and `minor` violations are logged but do not block merge
 * (matching the audit severity policy from a11y-audit.md).
 *
 * Pages scanned:
 *   1. Login page (/login)
 *   2. Dashboard (/ )
 *   3. Plugins list (/plugins)
 *   4. Admin settings (/admin/settings) — tenant branding tab
 *
 * All API calls intercepted — no real backend required.
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mockAllApis } from './helpers/api-mocks';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Run an axe scan on the current page and assert no critical/serious violations.
 * Returns the full results so individual tests can add further assertions.
 */
async function runAxeScan(page: import('@playwright/test').Page) {
  const results = await new AxeBuilder({ page })
    // Scope to WCAG 2.1 AA rules only (matches Constitution Art. 1.3)
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    // Exclude third-party iframes that we cannot control
    .exclude('iframe[src*="keycloak"]')
    .analyze();

  // Separate critical/serious (blocking) from moderate/minor (advisory)
  const blocking = results.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious'
  );
  const advisory = results.violations.filter(
    (v) => v.impact === 'moderate' || v.impact === 'minor'
  );

  // Log advisory violations for visibility without failing the test
  if (advisory.length > 0) {
    console.warn(
      `[a11y] ${advisory.length} advisory violations on ${page.url()}:\n` +
        advisory.map((v) => `  [${v.impact}] ${v.id}: ${v.description}`).join('\n')
    );
  }

  return { blocking, advisory, raw: results };
}

// ---------------------------------------------------------------------------
// Login page
// ---------------------------------------------------------------------------

test.describe('A11Y — Login page (/login)', () => {
  /**
   * 1.1 No critical/serious axe violations on the idle login page.
   *
   * The login page renders a sign-in button, tenant branding, and error states.
   * axe should find no blocking WCAG 2.1 AA violations.
   */
  test('1.1 no critical or serious WCAG violations on idle login page', async ({ page }) => {
    await mockAllApis(page);
    await page.goto('/login');

    // Wait for the Sign In button to be visible before scanning
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible({ timeout: 10000 });

    const { blocking } = await runAxeScan(page);

    // Build a readable failure message listing each violation
    const msg = blocking
      .map(
        (v) =>
          `[${v.impact}] ${v.id}: ${v.description}\n` +
          v.nodes.map((n) => `    target: ${n.target.join(', ')}`).join('\n')
      )
      .join('\n\n');

    expect(blocking, `axe found blocking violations:\n${msg}`).toHaveLength(0);
  });

  /**
   * 1.2 Login page passes axe scan when error state is shown.
   *
   * The keycloakError state renders a role="alert" banner — must remain accessible.
   */
  test('1.2 no critical or serious violations in login error state', async ({ page }) => {
    await mockAllApis(page);

    // Force the auth login endpoint to return a 503 so keycloakError=true is triggered
    await page.route('**/api/v1/auth/login-url', async (route) => {
      await route.fulfill({ status: 503, body: 'Service Unavailable' });
    });

    await page.goto('/login');
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible({ timeout: 10000 });

    // Trigger the error state by clicking Sign In
    await page.getByRole('button', { name: /sign in with your account/i }).click();

    // Wait for the error alert to appear
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 5000 });

    const { blocking } = await runAxeScan(page);
    const msg = blocking.map((v) => `[${v.impact}] ${v.id}: ${v.description}`).join('\n');
    expect(blocking, `axe found blocking violations:\n${msg}`).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

test.describe('A11Y — Dashboard (/)', () => {
  /**
   * 2.1 No critical/serious axe violations on the authenticated dashboard.
   *
   * The dashboard renders the full AppLayout (skip link, header, sidebar, main, footer)
   * plus dashboard cards and plugin widgets.
   */
  test('2.1 no critical or serious WCAG violations on dashboard', async ({ page }) => {
    await mockAllApis(page);
    await page.goto('/');

    // Wait for content to be ready
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({
      timeout: 15000,
    });

    const { blocking } = await runAxeScan(page);
    const msg = blocking
      .map(
        (v) =>
          `[${v.impact}] ${v.id}: ${v.description}\n` +
          v.nodes.map((n) => `    target: ${n.target.join(', ')}`).join('\n')
      )
      .join('\n\n');

    expect(blocking, `axe found blocking violations:\n${msg}`).toHaveLength(0);
  });

  /**
   * 2.2 AppLayout skip-to-content link passes axe scan (A11Y-S01 regression guard).
   *
   * Specifically checks that the skip link is a proper bypass mechanism and
   * that `#main-content` target exists in the DOM.
   */
  test('2.2 skip-to-content link and #main-content target both present in DOM', async ({
    page,
  }) => {
    await mockAllApis(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({
      timeout: 15000,
    });

    // Verify skip link exists and points to #main-content
    const skipLink = page.getByRole('link', { name: /skip to main content/i });
    await expect(skipLink).toBeAttached();
    await expect(skipLink).toHaveAttribute('href', '#main-content');

    // Verify #main-content target exists
    const mainTarget = page.locator('#main-content');
    await expect(mainTarget).toBeAttached();
    await expect(mainTarget).toHaveAttribute('role', 'main');
  });
});

// ---------------------------------------------------------------------------
// Plugins page
// ---------------------------------------------------------------------------

test.describe('A11Y — Plugins page (/plugins)', () => {
  /**
   * 3.1 No critical/serious axe violations on the plugins list page.
   *
   * The plugins page renders the plugin catalog, install/uninstall buttons,
   * and the plugin marketplace section.
   */
  test('3.1 no critical or serious WCAG violations on plugins list', async ({ page }) => {
    await mockAllApis(page);
    await page.goto('/plugins');

    await expect(page.getByRole('heading', { name: 'Plugins' })).toBeVisible({
      timeout: 15000,
    });

    const { blocking } = await runAxeScan(page);
    const msg = blocking
      .map(
        (v) =>
          `[${v.impact}] ${v.id}: ${v.description}\n` +
          v.nodes.map((n) => `    target: ${n.target.join(', ')}`).join('\n')
      )
      .join('\n\n');

    expect(blocking, `axe found blocking violations:\n${msg}`).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Admin branding settings
// ---------------------------------------------------------------------------

test.describe('A11Y — Admin branding settings (/admin/settings)', () => {
  /**
   * 4.1 No critical/serious axe violations on the admin settings page.
   *
   * The settings page renders ColorPickerField, FontSelector, ThemePreview,
   * and logo upload UI — all of which have custom ARIA implementations.
   */
  test('4.1 no critical or serious WCAG violations on admin branding settings', async ({
    page,
  }) => {
    await mockAllApis(page);
    await page.goto('/admin/settings');

    // Wait for the settings page content to be present
    // The branding tab contains ColorPickerField and FontSelector
    await page
      .waitForSelector('[data-testid="branding-form"], [data-testid="color-picker"], h1, h2', {
        timeout: 15000,
      })
      .catch(() => {
        // If the specific selector is not found, fall back to waiting for the page to be idle
      });

    // Give the page a moment to fully settle (font async loading, theme vars)
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

    const { blocking } = await runAxeScan(page);
    const msg = blocking
      .map(
        (v) =>
          `[${v.impact}] ${v.id}: ${v.description}\n` +
          v.nodes.map((n) => `    target: ${n.target.join(', ')}`).join('\n')
      )
      .join('\n\n');

    expect(blocking, `axe found blocking violations:\n${msg}`).toHaveLength(0);
  });
});
