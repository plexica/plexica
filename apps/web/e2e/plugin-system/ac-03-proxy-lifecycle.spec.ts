import { getE2eApiToken } from '../../../../e2e/keycloak/ephemeral-client.js';
import { expect, test } from '../helpers/base-fixture.js';
import {
  ADMIN_TENANT_SLUG,
  loginAsAdmin,
  requireKeycloakInCI,
  uniqueName,
} from '../helpers/admin-login.js';
import {
  createWorkspaceFixture,
  ensureCrmInstalled,
  getBrowserToken,
} from '../helpers/plugin-fixtures.js';

const API_BASE = process.env['PLAYWRIGHT_API_URL'] ?? 'http://localhost:3001';

function headers(token: string, workspaceId?: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'X-Tenant-Slug': ADMIN_TENANT_SLUG,
    'Content-Type': 'application/json',
    ...(workspaceId ? { 'X-Plexica-Workspace-Id': workspaceId } : {}),
  };
}

async function setTenantStatus(
  page: import('@playwright/test').Page,
  status: 'active' | 'suspended'
): Promise<void> {
  const token = await getE2eApiToken();
  const list = await page.request.get(`${API_BASE}/api/v1/admin/tenants?search=e2e`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(list.status()).toBe(200);
  const tenant = (
    (await list.json()) as { data: Array<{ id: string; slug: string; version: number }> }
  ).data.find((item) => item.slug === 'e2e');
  expect(tenant).toBeDefined();
  const action = status === 'suspended' ? 'suspend' : 'reactivate';
  const response = await page.request.post(
    `${API_BASE}/api/v1/admin/tenants/${tenant!.id}/${action}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      data: { version: tenant!.version },
      timeout: 90_000,
    }
  );
  expect(response.status()).toBe(200);
}

// The e2e tenant realm mints 60s access tokens (see keycloak-admin-helpers).
// The browser silently refreshes on 401, but direct page.request calls bypass
// the app's api-client, so a token captured once expires during long lifecycle
// flows. Use the browser's persisted refresh token to mint a fresh access token
// (same grant the app uses) before the late-phase API calls.
async function refreshBrowserToken(
  page: import('@playwright/test').Page
): Promise<string> {
  const refreshToken = await page.evaluate(() => {
    const stored = sessionStorage.getItem('plexica-auth');
    if (stored === null) return '';
    const parsed = JSON.parse(stored) as { state?: { refreshToken?: string } };
    return parsed.state?.refreshToken ?? '';
  });
  expect(refreshToken, 'browser session has a refresh token').not.toBe('');
  const keycloakUrl = process.env['PLAYWRIGHT_KEYCLOAK_URL'] ?? 'http://localhost:8080';
  const realm = `plexica-${ADMIN_TENANT_SLUG}`;
  const response = await fetch(
    `${keycloakUrl}/realms/${realm}/protocol/openid-connect/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: 'plexica-web',
        refresh_token: refreshToken,
      }),
    }
  );
  expect(response.ok, `token refresh failed: ${response.status}`).toBe(true);
  const tokens = (await response.json()) as { access_token: string };
  return tokens.access_token;
}

test.describe.serial('004 Plugin System - AC-03: Proxy Lifecycle Visibility', () => {
  test.beforeAll(() => requireKeycloakInCI());

  test('denies hidden, deactivated, and suspended targets and restores only visible access', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await loginAsAdmin(page);
    const token = await getBrowserToken(page);
    const installId = await ensureCrmInstalled(page, token);
    const visibleWorkspaceId = await createWorkspaceFixture(
      page,
      token,
      uniqueName('proxy-visible')
    );
    const hiddenWorkspaceId = await createWorkspaceFixture(page, token, uniqueName('proxy-hidden'));
    const visibilityUrl = `${API_BASE}/api/v1/plugins/${installId}/visibility`;
    const proxyUrl = `${API_BASE}/api/v1/plugins/${installId}/proxy/context`;
    const visibility = await page.request.patch(visibilityUrl, {
      headers: headers(token),
      data: [
        { workspaceId: visibleWorkspaceId, isEnabled: true },
        { workspaceId: hiddenWorkspaceId, isEnabled: false },
      ],
    });
    expect(visibility.status(), await visibility.text()).toBe(200);

    expect(
      (
        await page.request.get(proxyUrl, {
          headers: headers(token, hiddenWorkspaceId),
        })
      ).status()
    ).toBe(403);

    await setTenantStatus(page, 'suspended');
    try {
      expect(
        (
          await page.request.get(proxyUrl, {
            headers: headers(token, visibleWorkspaceId),
          })
        ).status()
      ).toBe(403);
    } finally {
      await setTenantStatus(page, 'active');
    }

    await expect.poll(async () => {
      const response = await page.request.get(proxyUrl, {
        headers: headers(token, visibleWorkspaceId),
      });
      return response.status();
    }, { timeout: 90_000 }).toBe(200);

    const authedToken = await refreshBrowserToken(page);
    const deactivated = await page.request.post(
      `${API_BASE}/api/v1/plugins/${installId}/deactivate`,
      { headers: headers(authedToken), data: {}, timeout: 90_000 }
    );
    expect(deactivated.status(), await deactivated.text()).toBe(200);
    expect(
      (
        await page.request.get(proxyUrl, {
          headers: headers(authedToken, visibleWorkspaceId),
        })
      ).status()
    ).toBe(404);

    const reactivated = await page.request.post(
      `${API_BASE}/api/v1/plugins/${installId}/reactivate`,
      { headers: headers(authedToken), data: {}, timeout: 90_000 }
    );
    expect(reactivated.status(), await reactivated.text()).toBe(200);
    // The reactivated container needs a moment to bind its port; poll until
    // the proxy converges back to 200 for the visible workspace.
    await expect.poll(
      async () =>
        (
          await page.request.get(proxyUrl, {
            headers: headers(authedToken, visibleWorkspaceId),
          })
        ).status(),
      { timeout: 90_000 }
    ).toBe(200);
    expect(
      (
        await page.request.get(proxyUrl, {
          headers: headers(authedToken, hiddenWorkspaceId),
        })
      ).status()
    ).toBe(403);
  });
});
