import { ADMIN_TENANT_SLUG } from './admin-login.js';
import { tenantApiUrl } from './tenant-hosts.js';

import type { Page } from '@playwright/test';

interface Installation {
  id: string;
  pluginSlug?: string;
  status: string;
}

export async function getBrowserToken(page: Page): Promise<string> {
  const token = await page.evaluate(() => {
    const stored = sessionStorage.getItem('plexica-auth');
    if (stored === null) return '';
    const parsed = JSON.parse(stored) as { state?: { accessToken?: string } };
    return parsed.state?.accessToken ?? '';
  });
  if (token === '') throw new Error('Authenticated browser session has no access token');
  return token;
}

function apiHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export async function createWorkspaceFixture(
  page: Page,
  token: string,
  name: string,
  tenantSlug = ADMIN_TENANT_SLUG
): Promise<string> {
  const response = await page.request.post(tenantApiUrl(tenantSlug, '/api/v1/workspaces'), {
    headers: apiHeaders(token),
    data: { name },
  });
  if (response.status() !== 201) {
    throw new Error(
      `Workspace fixture creation failed: ${response.status()} ${await response.text()}`
    );
  }
  return ((await response.json()) as { id: string }).id;
}

async function listInstallations(page: Page, token: string): Promise<Installation[]> {
  const response = await page.request.get(
    tenantApiUrl(ADMIN_TENANT_SLUG, '/api/v1/plugins/installed'),
    {
      headers: apiHeaders(token),
    }
  );
  if (response.status() !== 200) {
    throw new Error(`Installed plugin fixture lookup failed: ${response.status()}`);
  }
  return (await response.json()) as Installation[];
}

export async function ensureCrmInstalled(page: Page, token: string): Promise<string> {
  const existing = (await listInstallations(page, token)).find(
    (installation) => installation.pluginSlug === 'crm' && installation.status !== 'uninstalled'
  );
  if (existing === undefined) {
    throw new Error('Production-compatible CRM installation fixture is missing');
  }
  return existing.id;
}

export async function setWorkspaceMember(
  page: Page,
  adminToken: string,
  workspaceId: string,
  userId: string,
  role: 'admin' | 'member' | 'viewer'
): Promise<void> {
  const response = await page.request.post(
    tenantApiUrl(ADMIN_TENANT_SLUG, `/api/v1/workspaces/${workspaceId}/members`),
    { headers: apiHeaders(adminToken), data: { userId, role } }
  );
  if (response.status() === 201) return;
  if (response.status() === 409) {
    const update = await page.request.patch(
      tenantApiUrl(ADMIN_TENANT_SLUG, `/api/v1/workspaces/${workspaceId}/members/${userId}`),
      { headers: apiHeaders(adminToken), data: { role } }
    );
    if (update.status() === 200) return;
  }
  throw new Error(`Workspace membership update failed: ${response.status()}`);
}
