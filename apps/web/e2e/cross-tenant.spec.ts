// NFR-04: production host routing and cross-tenant data isolation.

import { expect, test } from './helpers/base-fixture.js';
import { createWorkspaceFixture, getBrowserToken } from './helpers/plugin-fixtures.js';
import { loginViaKeycloak } from './helpers/keycloak-login.js';
import { tenantApiUrl } from './helpers/tenant-hosts.js';

const TENANT_A_SLUG = process.env['PLAYWRIGHT_TENANT_A_SLUG'] ?? 'e2e';
const TENANT_B_SLUG = process.env['PLAYWRIGHT_TENANT_B_SLUG'] ?? 'e2e-b';
const USERNAME = process.env['PLAYWRIGHT_KEYCLOAK_USER'] ?? '';
const PASSWORD = process.env['PLAYWRIGHT_KEYCLOAK_PASS'] ?? '';

async function login(
  page: Parameters<typeof getBrowserToken>[0],
  tenantSlug: string
): Promise<string> {
  await loginViaKeycloak(page, { tenantSlug, username: USERNAME, password: PASSWORD });
  return getBrowserToken(page);
}

test.describe('Production tenant routing and isolation (NFR-04)', () => {
  test.beforeAll(() => {
    if (USERNAME === '' || PASSWORD === '') {
      throw new Error('Cross-tenant E2E requires seeded Keycloak credentials');
    }
  });

  test('correct subdomain and token realm succeeds', async ({ page }) => {
    const tokenA = await login(page, TENANT_A_SLUG);
    const response = await page.request.get(tenantApiUrl(TENANT_A_SLUG, '/api/me'), {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({ realm: `plexica-${TENANT_A_SLUG}` });
  });

  test('token from the wrong realm fails on another tenant host', async ({ page }) => {
    const tokenA = await login(page, TENANT_A_SLUG);
    const response = await page.request.get(tenantApiUrl(TENANT_B_SLUG, '/api/me'), {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(response.status()).toBe(404);
    expect(await response.text()).not.toContain(TENANT_B_SLUG.replace(/-/g, '_'));
  });

  test('X-Tenant-Slug cannot override Host in production', async ({ page }) => {
    const tokenA = await login(page, TENANT_A_SLUG);
    const response = await page.request.get(tenantApiUrl(TENANT_A_SLUG, '/api/me'), {
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'X-Tenant-Slug': TENANT_B_SLUG,
      },
    });
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({ realm: `plexica-${TENANT_A_SLUG}` });
  });

  test('tenant B data is not visible in tenant A', async ({ page, context }) => {
    const tokenB = await login(page, TENANT_B_SLUG);
    const workspaceName = `tenant-b-private-${Date.now()}`;
    const workspaceB = await createWorkspaceFixture(page, tokenB, workspaceName, TENANT_B_SLUG);

    await context.clearCookies();
    await page.evaluate(() => sessionStorage.clear());
    const tokenA = await login(page, TENANT_A_SLUG);
    const response = await page.request.get(
      tenantApiUrl(TENANT_A_SLUG, `/api/v1/workspaces/${workspaceB}`),
      { headers: { Authorization: `Bearer ${tokenA}` } }
    );

    expect(response.status()).toBe(404);
    expect(await response.text()).not.toContain(workspaceName);
  });
});
