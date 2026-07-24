import { randomUUID } from 'node:crypto';

import { expect, test } from '../helpers/base-fixture.js';
import {
  ADMIN_TENANT_SLUG,
  loginAsAdmin,
  loginAsMember,
  loginAsViewer,
  requireKeycloakInCI,
  uniqueName,
} from '../helpers/admin-login.js';
import {
  createWorkspaceFixture,
  ensureCrmInstalled,
  getBrowserToken,
  setWorkspaceMember,
} from '../helpers/plugin-fixtures.js';

import type { Page } from '@playwright/test';

const API_BASE = process.env['PLAYWRIGHT_API_URL'] ?? 'http://localhost:3001';
let installId = '';
let workspaceId = '';
let nonMemberWorkspaceId = '';
let adminToken = '';

function headers(token: string, targetWorkspaceId?: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'X-Tenant-Slug': ADMIN_TENANT_SLUG,
    'Content-Type': 'application/json',
    ...(targetWorkspaceId ? { 'X-Plexica-Workspace-Id': targetWorkspaceId } : {}),
  };
}

async function profileId(page: Page, token: string): Promise<string> {
  const response = await page.request.get(`${API_BASE}/api/v1/profile`, {
    headers: headers(token),
  });
  expect(response.status()).toBe(200);
  return ((await response.json()) as { userId: string }).userId;
}

test.describe.serial('004 Plugin System - AC-02: Plugin Proxy Authorization', () => {
  test.beforeAll(() => requireKeycloakInCI());

  test('tenant admin maps to plugin admin through documented tenant-wide access', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    adminToken = await getBrowserToken(page);
    installId = await ensureCrmInstalled(page, adminToken);
    workspaceId = await createWorkspaceFixture(page, adminToken, uniqueName('proxy-roles'));
    nonMemberWorkspaceId = await createWorkspaceFixture(
      page,
      adminToken,
      uniqueName('proxy-outsider')
    );
    const response = await page.request.get(
      `${API_BASE}/api/v1/plugins/${installId}/proxy/context`,
      { headers: headers(adminToken, workspaceId) }
    );
    expect(response.status(), await response.text()).toBe(200);
    expect(await response.json()).toMatchObject({ role: 'admin', workspaceId });
  });

  test('member and admin roles are forwarded from workspace_member', async ({ page }) => {
    await loginAsMember(page);
    const token = await getBrowserToken(page);
    const userId = await profileId(page, token);
    await setWorkspaceMember(page, adminToken, workspaceId, userId, 'member');
    const proxyUrl = `${API_BASE}/api/v1/plugins/${installId}/proxy/contacts`;
    const memberContext = await page.request.get(
      `${API_BASE}/api/v1/plugins/${installId}/proxy/context`,
      { headers: headers(token, workspaceId) }
    );
    expect(await memberContext.json()).toMatchObject({ role: 'member', workspaceId });
    const create = await page.request.post(proxyUrl, {
      headers: headers(token, workspaceId),
      data: { name: 'Member contact' },
    });
    expect(create.status(), await create.text()).toBe(201);
    expect((await create.json()) as { id: string }).toEqual(
      expect.objectContaining({ id: expect.any(String) })
    );

    await setWorkspaceMember(page, adminToken, workspaceId, userId, 'admin');
    const adminContext = await page.request.get(
      `${API_BASE}/api/v1/plugins/${installId}/proxy/context`,
      {
        headers: headers(token, workspaceId),
      }
    );
    expect(adminContext.status()).toBe(200);
    expect(await adminContext.json()).toMatchObject({ role: 'admin', workspaceId });
  });

  test('viewer role permits reads and denies writes', async ({ page }) => {
    await loginAsViewer(page);
    const token = await getBrowserToken(page);
    const userId = await profileId(page, token);
    await setWorkspaceMember(page, adminToken, workspaceId, userId, 'viewer');
    const proxyUrl = `${API_BASE}/api/v1/plugins/${installId}/proxy/contacts`;
    const read = await page.request.get(proxyUrl, { headers: headers(token, workspaceId) });
    expect(read.status(), 'viewer workspace role permits reads').toBe(200);
    const viewerContext = await page.request.get(
      `${API_BASE}/api/v1/plugins/${installId}/proxy/context`,
      { headers: headers(token, workspaceId) }
    );
    expect(await viewerContext.json()).toMatchObject({ role: 'viewer', workspaceId });
    const write = await page.request.post(proxyUrl, {
      headers: headers(token, workspaceId),
      data: { name: 'Denied viewer contact' },
    });
    expect(write.status(), 'viewer workspace role denies writes').toBe(403);
  });

  test('missing, forged, and non-member workspaces deny before forwarding', async ({ page }) => {
    await loginAsAdmin(page);
    const adminToken = await getBrowserToken(page);
    const proxyUrl = `${API_BASE}/api/v1/plugins/${installId}/proxy/context`;
    expect((await page.request.get(proxyUrl, { headers: headers(adminToken) })).status()).toBe(422);
    expect(
      (
        await page.request.get(proxyUrl, {
          headers: headers(adminToken, randomUUID()),
        })
      ).status()
    ).toBe(403);

    await page.evaluate(() => sessionStorage.clear());
    await page.context().clearCookies();
    await loginAsViewer(page);
    const viewerToken = await getBrowserToken(page);
    expect(
      (
        await page.request.get(proxyUrl, {
          headers: headers(viewerToken, nonMemberWorkspaceId),
        })
      ).status()
    ).toBe(403);
  });
});
