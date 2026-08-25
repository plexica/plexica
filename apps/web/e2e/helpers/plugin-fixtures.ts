import { ADMIN_TENANT_SLUG } from './admin-login.js';
import { tenantApiUrl } from './tenant-hosts.js';

import type { EndpointKey, EndpointKeyOptions } from './tenant-hosts.js';
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
  tenantSlug = ADMIN_TENANT_SLUG,
  hostKeys: EndpointKeyOptions = {}
): Promise<string> {
  const response = await page.request.post(
    tenantApiUrl(tenantSlug, '/api/v1/workspaces', { apiKey: hostKeys.apiKey }),
    {
      headers: apiHeaders(token),
      data: { name },
    }
  );
  if (response.status() !== 201) {
    throw new Error(
      `Workspace fixture creation failed: ${response.status()} ${await response.text()}`
    );
  }
  return ((await response.json()) as { id: string }).id;
}

async function listInstallations(
  page: Page,
  token: string,
  apiKey?: EndpointKey | undefined
): Promise<Installation[]> {
  const response = await page.request.get(
    tenantApiUrl(ADMIN_TENANT_SLUG, '/api/v1/plugins/installed', { apiKey }),
    {
      headers: apiHeaders(token),
    }
  );
  if (response.status() !== 200) {
    throw new Error(`Installed plugin fixture lookup failed: ${response.status()}`);
  }
  return (await response.json()) as Installation[];
}

export interface CrmInstallPollOptions {
  pollIntervalMs?: number;
  timeoutMs?: number;
  apiKey?: EndpointKey | undefined;
}

const DEFAULT_POLL_INTERVAL_MS = 1000;
const DEFAULT_POLL_TIMEOUT_MS = 15000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function describeInstallResponse(body: Record<string, unknown>): string {
  const parts: string[] = [];
  if (typeof body.status === 'string') parts.push(`status='${body.status}'`);
  if ('degraded' in body) parts.push(`degraded=${JSON.stringify(body.degraded)}`);
  if (parts.length === 0) return '<no status/degraded fields>';
  return parts.join(', ');
}

export async function ensureCrmInstalled(
  page: Page,
  token: string,
  options: CrmInstallPollOptions = {}
): Promise<string> {
  const existing = (await listInstallations(page, token, options.apiKey)).find(
    (installation) => installation.pluginSlug === 'crm' && installation.status !== 'uninstalled'
  );
  if (existing !== undefined) return existing.id;
  const response = await page.request.post(
    tenantApiUrl(ADMIN_TENANT_SLUG, '/api/v1/plugins/crm/install', { apiKey: options.apiKey }),
    { headers: apiHeaders(token), data: {} }
  );
  if (!response.ok()) {
    throw new Error(`CRM contract fixture provisioning failed: ${response.status()} ${await response.text()}`);
  }
  const installBody = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_POLL_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;
  let observedStatus = 'missing';
  while (Date.now() < deadline) {
    const fixture = (await listInstallations(page, token, options.apiKey)).find(
      (installation) => installation.pluginSlug === 'crm' && installation.status !== 'uninstalled'
    );
    if (fixture?.status === 'active') return fixture.id;
    observedStatus = fixture?.status ?? 'missing';
    await sleep(pollIntervalMs);
  }
  throw new Error(
    `CRM contract fixture was not activated within ${timeoutMs}ms; ` +
      `last observed crm installation status: '${observedStatus}'; ` +
      `install response reported: ${describeInstallResponse(installBody)}`
  );
}

/**
 * Arrangement for the marketplace install-flow spec: guarantees the CRM
 * plugin starts from the canonical post-seed baseline (catalog present,
 * nothing installed). Idempotent — a fresh stack is a no-op. The contract
 * bootstrap legitimately installs CRM before the full suite runs; this
 * restores the baseline the install-flow assertions are defined against.
 */
export async function ensureCrmUninstalled(
  page: Page,
  token: string,
  options: CrmInstallPollOptions = {}
): Promise<void> {
  const existing = (await listInstallations(page, token, options.apiKey)).find(
    (installation) => installation.pluginSlug === 'crm' && installation.status !== 'uninstalled'
  );
  if (existing === undefined) return;
  const response = await page.request.post(
    tenantApiUrl(ADMIN_TENANT_SLUG, `/api/v1/plugins/${existing.id}/uninstall`, {
      apiKey: options.apiKey,
    }),
    { headers: apiHeaders(token), data: {} }
  );
  if (!response.ok()) {
    throw new Error(`CRM uninstall arrangement failed: ${response.status()} ${await response.text()}`);
  }
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_POLL_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const remaining = (await listInstallations(page, token, options.apiKey)).find(
      (installation) => installation.pluginSlug === 'crm' && installation.status !== 'uninstalled'
    );
    if (remaining === undefined) return;
    await sleep(pollIntervalMs);
  }
  throw new Error(`CRM uninstall was not reflected within ${timeoutMs}ms`);
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
