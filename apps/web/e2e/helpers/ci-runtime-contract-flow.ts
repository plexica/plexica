import { expect } from '@playwright/test';

import { ciRuntimeManifest } from '../../../../e2e/ci-runtime-manifest.js';


import { ADMIN_TENANT_SLUG, loginAsAdmin, uniqueName } from './admin-login.js';
import { ensureCrmInstalled } from './crm-plugin-fixture.js';
import { pluginProxyRequestWithRetry } from './plugin-proxy-retry.js';
import { createWorkspaceFixture, getBrowserToken } from './plugin-fixtures.js';

import type { PluginProxyAttemptResult } from './plugin-proxy-retry.js';
import type { EndpointKeyOptions } from './tenant-hosts.js';
import type { APIRequestContext, Page, Response } from '@playwright/test';

export { pluginProxyRequestWithRetry } from './plugin-proxy-retry.js';
export type { PluginProxyRetryOptions, PluginProxyAttemptResult } from './plugin-proxy-retry.js';

export interface CiRuntimeContractFlowOptions {
  appLabel: string;
  baseUrl: string;
  /**
   * Endpoint env keys for the invoking app: web uses the defaults, admin
   * passes PLAYWRIGHT_ADMIN_BASE_URL / PLAYWRIGHT_CORE_API_URL (spec 010).
   */
  hostKeys?: EndpointKeyOptions;
}

// Live run 32833067545: after a successful install the CRM sidecar was still
// starting ("health: starting") when the plugin-proxy request fired, so Core
// answered a 502-class PLUGIN_BACKEND_UNREACHABLE. The bounded retry lives in
// ./plugin-proxy-retry.js so fixture helpers can share it without cycles.
export async function browserFetchBody(
  page: Page,
  url: string,
  init: { credentials: 'include'; headers: Record<string, string> }
): Promise<PluginProxyAttemptResult> {
  return page.evaluate(async (request) => {
    const response = await fetch(request.url, {
      credentials: request.init.credentials,
      headers: request.init.headers,
    });
    return { status: response.status, body: await response.text() };
  }, { url, init });
}

export async function runCiRuntimeContractFlow(
  page: Page,
  request: APIRequestContext,
  options: CiRuntimeContractFlowOptions
): Promise<void> {
  const runtime = ciRuntimeManifest();
  const hostKeys = options.hostKeys ?? {};
  await page.goto(options.baseUrl);
  await loginAsAdmin(page, hostKeys);
  const token = await getBrowserToken(page);
  // The CRM sidecar health gate (Docker start + circuit-breaker health poll)
  // can take well over the 15s fixture default under CI load (observed 16s
  // install + 'degraded' until the next 30s poll closes the circuit). Give
  // the contract a window aligned with the core's 30s poller plus margin.
  const installId = await ensureCrmInstalled(page, token, {
    apiKey: hostKeys.apiKey,
    pollIntervalMs: 2_000,
    timeoutMs: 90_000,
    // Consumer-start retries with backoff (install-runtime.service.ts) can
    // push the install POST past the 30s API default under CI load.
    installTimeoutMs: 90_000,
  });
  // The install wait can exceed the 60s access-token TTL (H-04): the token
  // captured before it may be expired. Re-read the refreshed token for the
  // workspace/proxy calls that follow (CodeRabbit).
  const freshToken = await getBrowserToken(page);
  const workspaceId = await createWorkspaceFixture(
    page,
    freshToken,
    uniqueName('ci-runtime-contract'),
    ADMIN_TENANT_SLUG,
    hostKeys
  );
  const ordinaryWait = waitForContractResponse(page, '/api/v1/health', 'ordinary');
  const pluginPathname = `/api/v1/plugins/${installId}/proxy/_plexica/health`;
  const pluginWait = waitForContractResponse(page, pluginPathname, 'plugin');
  const result = await page.evaluate(async ({ accessToken, workspace }) => {
    const headers = { Authorization: `Bearer ${accessToken}`, 'X-Plexica-Workspace-Id': workspace };
    const ordinaryResponse = await fetch('/api/v1/health?contract=ordinary');
    return {
      ordinary: { status: ordinaryResponse.status, body: await ordinaryResponse.json() },
      headers,
    };
  }, { accessToken: freshToken, workspace: workspaceId });
  const pluginResult = await pluginProxyRequestWithRetry(() =>
    browserFetchBody(page, `${pluginPathname}?contract=plugin`, {
      credentials: 'include',
      headers: result.headers,
    })
  );
  await assertSameOriginContract(
    page,
    runtime.CORE_API_PUBLIC_BASE,
    [await ordinaryWait, await pluginWait],
    freshToken,
    workspaceId,
    options.appLabel
  );
  await assertNoWildcardCors(page, request);
  expect(result.ordinary).toEqual({ status: 200, body: { status: 'ok', version: '2.0.0' } });
  expect(pluginResult.status, pluginResult.body).toBeGreaterThanOrEqual(200);
  expect(pluginResult.status, pluginResult.body).toBeLessThan(300);
  expect(pluginResult.body).toContain('healthy');
  expect(await page.evaluate(() => window.__PLEXICA_RUNTIME_CONFIG__?.apiBase)).toBe('');
}

export function waitForContractResponse(page: Page, pathname: string, contract: string) {
  return page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === pathname && url.search === `?contract=${contract}`;
  });
}

/**
 * Single-response same-origin check shared by the web flow (which asserts a
 * pair of captured responses) and the admin contract (which drives its own
 * super-admin session through the admin preview proxy).
 */
export async function assertSameOriginResponse(
  page: Page,
  coreApiPublicBase: string,
  response: Response,
  appLabel: string
): Promise<void> {
  const sent = response.request();
  expect(new URL(sent.url()).origin, `${appLabel} must keep requests same-origin`).toBe(
    new URL(page.url()).origin
  );
  expect(
    sent.url().startsWith(coreApiPublicBase),
    `${appLabel} must not reach the Core public base directly`
  ).toBe(false);
}

async function assertSameOriginContract(
  page: Page,
  coreApiPublicBase: string,
  responses: [Response, Response],
  token: string,
  workspaceId: string,
  appLabel: string
): Promise<void> {
  const [ordinaryResponse, pluginResponse] = responses;
  for (const response of responses) {
    await assertSameOriginResponse(page, coreApiPublicBase, response, appLabel);
  }
  expect(ordinaryResponse.request().method()).toBe('GET');
  expect(pluginResponse.request().method()).toBe('GET');
  expect(new URL(pluginResponse.url()).search).toBe('?contract=plugin');
  const pluginHeaders = await pluginResponse.request().allHeaders();
  expect(pluginHeaders.authorization).toBe(`Bearer ${token}`);
  expect(pluginHeaders['x-plexica-workspace-id']).toBe(workspaceId);
  for (const response of responses)
    expect(response.headers()['access-control-allow-origin']).not.toBe('*');
}

export async function assertNoWildcardCors(page: Page, request: APIRequestContext): Promise<void> {
  const probe = await request.fetch(
    `${new URL(page.url()).origin}/api/v1/health?contract=cors-probe`,
    {
      headers: { Origin: 'http://evil.example' },
    }
  );
  const allowOrigin = probe.headers()['access-control-allow-origin'];
  expect(allowOrigin, 'CI contract forbids wildcard CORS on cross-origin API probes').not.toBe('*');
  expect(allowOrigin, 'CI contract forbids reflecting foreign origins').not.toBe(
    'http://evil.example'
  );
}
