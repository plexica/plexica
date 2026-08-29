// crm-plugin-fixture.ts
// Install/uninstall fixtures for the example CRM plugin, including a proxy
// warm-up: right after install activation the sidecar may still be cold
// (live run 32906681327), so the first proxied request timed out with
// PLUGIN_BACKEND_UNREACHABLE. ensureCrmInstalled therefore probes the real
// proxy health path until the backend answers before handing the install to
// any spec.

import { API_TIMEOUT_MS } from '../../../../e2e/playwright-base.js';

import { ADMIN_TENANT_SLUG, uniqueName } from './admin-login.js';
import { refreshBrowserToken } from './keycloak-token.js';
import { createWorkspaceFixture } from './plugin-fixtures.js';
import { listInstallations, apiHeaders } from './plugin-installations.js';
import { pluginProxyRequestWithRetry } from './plugin-proxy-retry.js';
import { tenantApiUrl } from './tenant-hosts.js';

import type { EndpointKey } from './tenant-hosts.js';
import type { PluginProxyRetryOptions } from './plugin-proxy-retry.js';
import type { Page } from '@playwright/test';

export interface CrmInstallPollOptions {
  pollIntervalMs?: number;
  timeoutMs?: number;
  warmup?: PluginProxyRetryOptions;
  apiKey?: EndpointKey | undefined;
  /** Token source for poll iterations. Defaults to a fresh refresh-token
   *  grant (H-04: 60s access TTL). Unit tests inject a stub. */
  tokenProvider?: (page: Page) => Promise<string>;
  /** Timeout for the install POST itself. Defaults to API_TIMEOUT_MS; the
   *  contract raises it because consumer-start retries with backoff can push
   *  the install over 30s under CI load. */
  installTimeoutMs?: number;
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
    { headers: apiHeaders(token), timeout: API_TIMEOUT_MS }
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
          timeout: API_TIMEOUT_MS,
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
    {
      headers: apiHeaders(token),
      data: {},
      timeout: options.installTimeoutMs ?? API_TIMEOUT_MS,
    }
  );
  if (!response.ok()) {
    throw new Error(`CRM contract fixture provisioning failed: ${response.status()} ${await response.text()}`);
  }
  const installBody = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_POLL_TIMEOUT_MS;
  const tokenProvider = options.tokenProvider ?? refreshBrowserToken;
  const deadline = Date.now() + timeoutMs;
  let observedStatus = 'missing';
  while (Date.now() < deadline) {
    // H-04: the realm access token TTL is 60s, and the install flow (sidecar
    // start + health poll) routinely exceeds that under CI load. The browser's
    // api-client refreshes silently, but this direct page.request.* flow
    // bypasses it — mint a fresh token from the persisted refresh token on
    // every poll instead of holding a static (expiring) copy.
    const freshToken = await tokenProvider(page);
    const fixture = (await listInstallations(page, freshToken, options.apiKey)).find(
      (installation) => installation.pluginSlug === 'crm' && installation.status !== 'uninstalled'
    );
    if (fixture?.status === 'active') {
      await warmUpPluginProxy(page, freshToken, fixture.id, options);
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
    { headers: apiHeaders(token), data: {}, timeout: API_TIMEOUT_MS }
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
