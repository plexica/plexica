// keycloak-login.ts
// Shared Keycloak login helper for E2E test suites.
// Centralises credential env-var reading, the hasKeycloak guard, the CI-fail
// safeguard (P10-M-2), and the login page flow (P10-L-1) — fixing selector
// drift and the missing KEYCLOAK_PASSWORD guard (P10-M-1) in one place.

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as url from 'node:url';

import type { Page } from '@playwright/test';

export const KEYCLOAK_URL = process.env['PLAYWRIGHT_KEYCLOAK_URL'] ?? '';
export const KEYCLOAK_USERNAME = process.env['PLAYWRIGHT_KEYCLOAK_USER'] ?? '';
export const KEYCLOAK_PASSWORD = process.env['PLAYWRIGHT_KEYCLOAK_PASS'] ?? '';
export const TENANT_SLUG = process.env['PLAYWRIGHT_TENANT_SLUG'] ?? 'test-tenant';

// P10-M-1: All three credentials must be present — a missing password causes nondeterministic
// login failures instead of a clean skip, violating the "no flaky tests" rule in AGENTS.md.
export const hasKeycloak =
  KEYCLOAK_URL.length > 0 && KEYCLOAK_USERNAME.length > 0 && KEYCLOAK_PASSWORD.length > 0;

/**
 * Throws in CI when Keycloak credentials are absent (P10-M-2).
 * Prevents silent green-with-zero-tests CI runs (Constitution Rules 1 and 2).
 * Call inside `test.beforeAll()` in every suite that requires Keycloak.
 */
export function requireKeycloakInCI(): void {
  if (process.env['CI'] !== undefined && !hasKeycloak) {
    throw new Error(
      'CI requires PLAYWRIGHT_KEYCLOAK_URL, PLAYWRIGHT_KEYCLOAK_USER, and ' +
        'PLAYWRIGHT_KEYCLOAK_PASS to be set — found at least one missing.'
    );
  }
}

/**
 * Navigates to `/?tenant=<tenantSlug>`, completes the Keycloak login form,
 * and waits for the post-login redirect back to the dashboard.
 *
 * Selectors target Keycloak default theme form fields. To fix selector drift
 * from a theme upgrade, update this function — one change covers all suites.
 */
export async function loginViaKeycloak(
  page: Page,
  { tenantSlug, username, password }: { tenantSlug: string; username: string; password: string }
): Promise<void> {
  await page.goto('/?tenant=' + tenantSlug);
  await page.waitForURL(/\/realms\//);
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', password);
  await page.click('input[type="submit"], button[type="submit"]');
  // P11-L-1: explicit 10s timeout matches login-flow.spec.ts and fails fast on
  // Keycloak misconfiguration rather than silently hanging for the 30s default.
  await page.waitForURL('**/dashboard', { timeout: 10_000 });
}

// ---------------------------------------------------------------------------
// Plexica theme marker
// ---------------------------------------------------------------------------

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const THEME_MARKER_PATH = path.resolve(__dirname, '..', '.e2e-plexica-theme-active');

/**
 * Returns true when the Plexica custom Keycloak theme is active for this run.
 * Written by global-setup.ts after the render probe. If the marker file is
 * absent (e.g. local dev without running global-setup), defaults to false so
 * theme-specific tests are skipped rather than timing out.
 */
export function isPlexicaThemeActive(): boolean {
  try {
    return fs.readFileSync(THEME_MARKER_PATH, 'utf8').trim() === '1';
  } catch {
    return false;
  }
}
