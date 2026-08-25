// crm-plugin-fixture.ts
// Install/uninstall fixtures for the example CRM plugin, including a proxy
// warm-up: right after install activation the sidecar may still be cold
// (live run 32906681327), so the first proxied request timed out with
// PLUGIN_BACKEND_UNREACHABLE. ensureCrmInstalled therefore probes the real
// proxy health path until the backend answers before handing the install to
// any spec.

import { ADMIN_TENANT_SLUG, uniqueName } from './admin-login.js';
import { pluginProxyRequestWithRetry } from './plugin-proxy-retry.js';
import { createWorkspaceFixture } from './plugin-fixtures.js';
import { tenantApiUrl } from './tenant-hosts.js';

import type { EndpointKey } from './tenant-hosts.js';
import type { PluginProxyRetryOptions } from './plugin-proxy-retry.js';
import type { Page } from '@playwright/test';

interface Installation {
  id: string;
  pluginSlug?: string;
  status: string;
}

export function apiHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export async function listInstallations(
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
  warmup?: PluginProxyRetryOptions;
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

async function deleteScratchWorkspace(
  page: Page,
  token: string,
  workspaceId: string,
  options: CrmInstallPollOptions
): Promise<void> {
  await page.request.delete(
    tenantApiUrl(ADMIN_TENANT_SLUG, `/api/v1/workspaces/${workspaceId}`, {
      apiKey: options.apiKey,
    }),
    { headers: apiHeaders(token) }
  );
}

async function warmUpPluginProxy(
  page: Page,
  token: string,
  installId: string,
  options: CrmInstallPollOptions
): Promise<void> {
  // The proxy requires a workspace id header; use a scratch workspace and
  // clean it up afterwards. Exhaustion throws so failures stay visible.
  const workspaceId = await createWorkspaceFixture(
    page,
    token,
    uniqueName('proxy-warmup'),
    ADMIN_TENANT_SLUG,
    { apiKey: options.apiKey }
  );
  try {
    const result = await pluginProxyRequestWithRetry(async () => {
      const response = await page.request.get(
        tenantApiUrl(ADMIN_TENANT_SLUG, `/api/v1/plugins/${installId}/proxy/_plexica/health`, {
          apiKey: options.apiKey,
        }),
        {
          headers: {
            ...apiHeaders(token),
            'X-Tenant-Slug': ADMIN_TENANT_SLUG,
            'X-Plexica-Workspace-Id': workspaceId,
          },
        }
      );
      return { status: response.status(), body: await response.text() };
    }, options.warmup);
    if (result.status < 200 || result.status >= 300) {
      throw new Error(`Plugin proxy warm-up failed: ${result.status} ${result.body}`);
    }
  } finally {
    await deleteScratchWorkspace(page, token, workspaceId, options);
  }
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
    if (fixture?.status === 'active') {
      await warmUpPluginProxy(page, token, fixture.id, options);
      return fixture.id;
    }
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
