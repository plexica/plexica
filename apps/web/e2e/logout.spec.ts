// logout.spec.ts
// E2E test: logout flow — verify Keycloak redirect and token invalidation.

import { expect, test, type Page } from '@playwright/test';

const KEYCLOAK_URL = process.env['PLAYWRIGHT_KEYCLOAK_URL'] ?? '';
const KEYCLOAK_USERNAME = process.env['PLAYWRIGHT_KEYCLOAK_USER'] ?? '';
const KEYCLOAK_PASSWORD = process.env['PLAYWRIGHT_KEYCLOAK_PASS'] ?? '';
const TENANT_SLUG = process.env['PLAYWRIGHT_TENANT_SLUG'] ?? 'test-tenant';
const API_BASE = process.env['PLAYWRIGHT_API_URL'] ?? 'http://localhost:3001';

const hasKeycloak = KEYCLOAK_URL.length > 0 && KEYCLOAK_USERNAME.length > 0;

async function loginAndGetToken(page: Page): Promise<string> {
  await page.goto('/?tenant=' + TENANT_SLUG);
  await page.waitForURL(/\/realms\//);
  await page.fill('input[name="username"]', KEYCLOAK_USERNAME);
  await page.fill('input[name="password"]', KEYCLOAK_PASSWORD);
  await page.click('input[type="submit"], button[type="submit"]');
  await page.waitForURL('**/dashboard');

  const token = await page.evaluate(() => {
    const stored = sessionStorage.getItem('plexica-auth');
    if (stored === null) return null;
    const parsed = JSON.parse(stored) as { state?: { accessToken?: string } };
    return parsed.state?.accessToken ?? null;
  });
  return token ?? '';
}

test.describe('Logout flow', () => {
  test.skip(!hasKeycloak, 'Requires live Keycloak');

  test('clicking Sign out redirects to Keycloak logout/login page', async ({ page }) => {
    await loginAndGetToken(page);
    // Open user menu and click Sign out
    await page
      .getByRole('button', { name: /sign out|[A-Z]/ })
      .first()
      .click();
    await page.getByText('Sign out').click();
    await page.waitForURL(/logout|login|realms/, { timeout: 5_000 });
    // Should be on Keycloak domain
    await expect(page).toHaveURL(new RegExp(KEYCLOAK_URL.replace(/https?:\/\//, '')));
  });

  test('API request with old token after logout returns 401', async ({ page }) => {
    const token = await loginAndGetToken(page);
    await page
      .getByRole('button', { name: /sign out|[A-Z]/ })
      .first()
      .click();
    await page.getByText('Sign out').click();
    await page.waitForURL(/logout|login|realms/, { timeout: 5_000 });

    const apiRes = await page.request.get(`${API_BASE}/api/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Tenant-Slug': TENANT_SLUG,
      },
    });
    expect(apiRes.status()).toBe(401);
  });
});
