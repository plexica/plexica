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
    }
  );
  expect(response.status()).toBe(200);
}

test.describe.serial('004 Plugin System - AC-03: Proxy Lifecycle Visibility', () => {
  test.beforeAll(() => requireKeycloakInCI());

  test('denies hidden, deactivated, and suspended targets and restores only visible access', async ({
    page,
  }) => {
    test.setTimeout(120_000);
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

    const deactivated = await page.request.post(
      `${API_BASE}/api/v1/plugins/${installId}/deactivate`,
      { headers: headers(token) }
    );
    expect(deactivated.status()).toBe(200);
    expect(
      (
        await page.request.get(proxyUrl, {
          headers: headers(token, visibleWorkspaceId),
        })
      ).status()
    ).toBe(404);

    const reactivated = await page.request.post(
      `${API_BASE}/api/v1/plugins/${installId}/reactivate`,
      { headers: headers(token), timeout: 90_000 }
    );
    expect(reactivated.status()).toBe(200);
    expect(
      (
        await page.request.get(proxyUrl, {
          headers: headers(token, visibleWorkspaceId),
        })
      ).status()
    ).toBe(200);
    expect(
      (
        await page.request.get(proxyUrl, {
          headers: headers(token, hiddenWorkspaceId),
        })
      ).status()
    ).toBe(403);
  });
});
