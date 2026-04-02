// cross-tenant.spec.ts
// E2E test: cross-tenant data isolation (NFR-04).
// Attempts to access tenant B resources while authenticated as tenant A.

import { expect, test } from '@playwright/test';

const KEYCLOAK_URL = process.env['PLAYWRIGHT_KEYCLOAK_URL'] ?? '';
const TENANT_A_SLUG = process.env['PLAYWRIGHT_TENANT_A_SLUG'] ?? 'tenant-a';
const TENANT_B_SLUG = process.env['PLAYWRIGHT_TENANT_B_SLUG'] ?? 'tenant-b';
const KEYCLOAK_USERNAME = process.env['PLAYWRIGHT_KEYCLOAK_USER'] ?? '';
const KEYCLOAK_PASSWORD = process.env['PLAYWRIGHT_KEYCLOAK_PASS'] ?? '';
const API_BASE = process.env['PLAYWRIGHT_API_URL'] ?? 'http://localhost:3001';

const hasKeycloak = KEYCLOAK_URL.length > 0 && KEYCLOAK_USERNAME.length > 0;

test.describe('Cross-tenant isolation (NFR-04)', () => {
  test.skip(!hasKeycloak, 'Requires live Keycloak and two seeded tenants');

  test('authenticated in tenant A, API call with tenant B slug returns 404 (H-2 realm mismatch)', async ({
    page,
  }) => {
    // Login as tenant A
    await page.goto('/?tenant=' + TENANT_A_SLUG);
    await page.waitForURL(/\/realms\//);
    await page.fill('input[name="username"]', KEYCLOAK_USERNAME);
    await page.fill('input[name="password"]', KEYCLOAK_PASSWORD);
    await page.click('input[type="submit"], button[type="submit"]');
    await page.waitForURL('**/dashboard');

    // Get tenant A token
    const tokenA = await page.evaluate(() => {
      const stored = sessionStorage.getItem('plexica-auth');
      if (stored === null) return null;
      const parsed = JSON.parse(stored) as { state?: { accessToken?: string } };
      return parsed.state?.accessToken ?? null;
    });

    // P6-L-1: Assert the token was actually retrieved — if sessionStorage is empty or the
    // key has changed, tokenA is null and the request would use an empty Bearer string,
    // returning 401/403 not 404, causing a misleading assertion failure.
    expect(
      tokenA,
      'sessionStorage plexica-auth must contain accessToken after login'
    ).not.toBeNull();

    // Use tenant A token with tenant B header — should be rejected
    const crossRes = await page.request.get(`${API_BASE}/api/me`, {
      headers: {
        Authorization: `Bearer ${tokenA ?? ''}`,
        'X-Tenant-Slug': TENANT_B_SLUG, // Wrong tenant context
      },
    });

    // Token from realm-A is not valid for realm-B — H-2 fix returns 404 (AC-2 anti-enumeration)
    expect(crossRes.status()).toBe(404);

    // Verify no tenant B data in response
    const body = await crossRes.text();
    expect(body).not.toContain(TENANT_B_SLUG.replace(/-/g, '_'));
  });

  test('tenant B data not visible in tenant A dashboard', async ({ page }) => {
    await page.goto('/?tenant=' + TENANT_A_SLUG);
    await page.waitForURL(/\/realms\//);
    await page.fill('input[name="username"]', KEYCLOAK_USERNAME);
    await page.fill('input[name="password"]', KEYCLOAK_PASSWORD);
    await page.click('input[type="submit"], button[type="submit"]');
    await page.waitForURL('**/dashboard');

    const bodyText = (await page.locator('body').textContent()) ?? '';
    // Tenant B identifiers must not appear in tenant A's UI
    expect(bodyText).not.toContain(TENANT_B_SLUG);
    expect(bodyText).not.toContain(`tenant_${TENANT_B_SLUG.replace(/-/g, '_')}`);
  });

  // P4-L-1: Resource-level isolation — attempt to read a tenant B resource ID as tenant A.
  // Implement once Workspace or resource CRUD routes exist (AC-2 full coverage).
  // Expected: GET /api/workspaces/:id using tenant B resource ID + tenant A auth → 404.
  //
  // P5-M-1 fix: test.skip() at describe-scope (outside a test callback) is a no-op in
  // Playwright — it skips nothing and the gap is invisible in CI reports. Wrapped in a
  // named test so the skip is properly recorded in the test run output.
  test('reading tenant B resource as tenant A returns 404 (AC-2)', async () => {
    test.skip(
      true,
      'TODO [AC-2]: implement once resource CRUD routes exist — reading tenant B resource as tenant A must return 404'
    );
  });
});
