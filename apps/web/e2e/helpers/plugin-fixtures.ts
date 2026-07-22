import { ADMIN_TENANT_SLUG } from './admin-login.js';
import { API_BASE } from './api-check.js';

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

function apiHeaders(token: string, tenantSlug = ADMIN_TENANT_SLUG): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'X-Tenant-Slug': tenantSlug,
    'Content-Type': 'application/json',
  };
}

export async function createWorkspaceFixture(
  page: Page,
  token: string,
  name: string,
  tenantSlug = ADMIN_TENANT_SLUG
): Promise<string> {
  const response = await page.request.post(`${API_BASE}/api/v1/workspaces`, {
    headers: apiHeaders(token, tenantSlug),
    data: { name },
  });
  if (response.status() !== 201) {
    throw new Error(`Workspace fixture creation failed: ${response.status()} ${await response.text()}`);
  }
  return ((await response.json()) as { id: string }).id;
}

async function listInstallations(page: Page, token: string): Promise<Installation[]> {
  const response = await page.request.get(`${API_BASE}/api/v1/plugins/installed`, {
    headers: apiHeaders(token),
  });
  if (response.status() !== 200) {
    throw new Error(`Installed plugin fixture lookup failed: ${response.status()}`);
  }
  return (await response.json()) as Installation[];
}

export async function ensureCrmInstalled(page: Page, token: string): Promise<string> {
  const registration = await page.request.post(`${API_BASE}/api/v1/dev/plugins/register`, {
    headers: apiHeaders(token),
    data: {
      slug: 'crm',
      backendUrl: 'http://localhost:4000',
      extensionPoints: [],
      actions: [],
      events: { subscribes: [] },
    },
  });
  if (registration.status() !== 200 && registration.status() !== 409) {
    throw new Error(
      `CRM dev backend registration failed: ${registration.status()} ${await registration.text()}`
    );
  }

  const existing = (await listInstallations(page, token)).find(
    (installation) => installation.pluginSlug === 'crm' && installation.status !== 'uninstalled'
  );
  if (existing !== undefined) return existing.id;

  const response = await page.request.post(`${API_BASE}/api/v1/plugins/crm/install`, {
    headers: apiHeaders(token),
    timeout: 90_000,
  });
  if (response.status() !== 200) {
    throw new Error(`CRM fixture installation failed: ${response.status()} ${await response.text()}`);
  }
  const body = (await response.json()) as { installId?: string };
  if (typeof body.installId !== 'string') throw new Error('CRM installation returned no installId');
  return body.installId;
}
