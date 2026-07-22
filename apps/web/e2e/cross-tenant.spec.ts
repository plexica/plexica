// cross-tenant.spec.ts
// E2E test: cross-tenant data isolation (NFR-04).
// Attempts to access tenant B resources while authenticated as tenant A.

import { expect, test } from './helpers/base-fixture.js';
import { createWorkspaceFixture, getBrowserToken } from './helpers/plugin-fixtures.js';
import { loginViaKeycloak } from './helpers/keycloak-login.js';

const TENANT_A_SLUG = process.env['PLAYWRIGHT_TENANT_A_SLUG'] ?? 'tenant-a';
const TENANT_B_SLUG = process.env['PLAYWRIGHT_TENANT_B_SLUG'] ?? 'tenant-b';
const KEYCLOAK_USERNAME = process.env['PLAYWRIGHT_KEYCLOAK_USER'] ?? '';
const KEYCLOAK_PASSWORD = process.env['PLAYWRIGHT_KEYCLOAK_PASS'] ?? '';
const API_BASE = process.env['PLAYWRIGHT_API_URL'] ?? 'http://localhost:3001';

test.describe('Cross-tenant isolation (NFR-04)', () => {
  test.beforeAll(() => {
    if (KEYCLOAK_USERNAME === '' || KEYCLOAK_PASSWORD === '') {
      throw new Error('Cross-tenant E2E requires seeded Keycloak credentials');
    }
  });

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

  test('reading tenant B resource as tenant A returns 404 (AC-2)', async ({ page, context }) => {
    await page.setExtraHTTPHeaders({ 'X-Tenant-Slug': TENANT_B_SLUG });
    await loginViaKeycloak(page, {
      tenantSlug: TENANT_B_SLUG,
      username: KEYCLOAK_USERNAME,
      password: KEYCLOAK_PASSWORD,
    });
    const tokenB = await getBrowserToken(page);
    const workspaceName = `tenant-b-private-${Date.now()}`;
    const workspaceB = await createWorkspaceFixture(
      page,
      tokenB,
      workspaceName,
      TENANT_B_SLUG
    );

    await context.clearCookies();
    await page.evaluate(() => sessionStorage.clear());
    await page.setExtraHTTPHeaders({ 'X-Tenant-Slug': TENANT_A_SLUG });
    await loginViaKeycloak(page, {
      tenantSlug: TENANT_A_SLUG,
      username: KEYCLOAK_USERNAME,
      password: KEYCLOAK_PASSWORD,
    });
    const tokenA = await getBrowserToken(page);
    const response = await page.request.get(`${API_BASE}/api/v1/workspaces/${workspaceB}`, {
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'X-Tenant-Slug': TENANT_A_SLUG,
      },
    });

    expect(response.status()).toBe(404);
    expect(await response.text()).not.toContain(workspaceName);
  });
});
