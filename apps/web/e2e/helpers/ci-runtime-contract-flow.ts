import { expect } from '@playwright/test';

import { ciRuntimeManifest } from '../../../../e2e/ci-runtime-manifest.js';


import { loginAsAdmin, uniqueName } from './admin-login.js';
import { createWorkspaceFixture, ensureCrmInstalled, getBrowserToken } from './plugin-fixtures.js';

import type { APIRequestContext, Page, Response } from '@playwright/test';

export interface CiRuntimeContractFlowOptions {
  appLabel: string;
  baseUrl: string;
}

// Live run 32833067545: after a successful install the CRM sidecar was still
// starting ("health: starting") when the plugin-proxy request fired, so Core
// answered a 502-class PLUGIN_BACKEND_UNREACHABLE. This is a startup race:
// retry bounded instead of failing the contract run.
export interface PluginProxyRetryOptions {
  intervalMs: number;
  timeoutMs: number;
}

export const PLUGIN_PROXY_RETRY_DEFAULTS: PluginProxyRetryOptions = {
  intervalMs: 1_000,
  timeoutMs: 20_000,
};

export interface PluginProxyAttemptResult {
  status: number;
  body: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function pluginProxyRequestWithRetry(
  attempt: () => Promise<PluginProxyAttemptResult>,
  options: PluginProxyRetryOptions = PLUGIN_PROXY_RETRY_DEFAULTS
): Promise<PluginProxyAttemptResult> {
  const deadline = Date.now() + options.timeoutMs;
  let last: PluginProxyAttemptResult | undefined;
  let lastError: unknown;
  for (;;) {
    try {
      const result = await attempt();
      if (result.status < 500) return result;
      last = result;
    } catch (error) {
      lastError = error;
    }
    if (Date.now() + options.intervalMs > deadline) break;
    await sleep(options.intervalMs);
  }
  const detail =
    last === undefined
      ? `last network error: ${String(lastError)}`
      : `last status=${last.status}, body=${last.body}`;
  throw new Error(
    `Plugin proxy did not answer within ${options.timeoutMs}ms retry window (${detail})`
  );
}

async function browserFetchBody(
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
  await page.goto(options.baseUrl);
  await loginAsAdmin(page);
  const token = await getBrowserToken(page);
  const installId = await ensureCrmInstalled(page, token);
  const workspaceId = await createWorkspaceFixture(page, token, uniqueName('ci-runtime-contract'));
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
  }, { accessToken: token, workspace: workspaceId });
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
    token,
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

function waitForContractResponse(page: Page, pathname: string, contract: string) {
  return page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === pathname && url.search === `?contract=${contract}`;
  });
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
    const sent = response.request();
    expect(new URL(sent.url()).origin, `${appLabel} must keep requests same-origin`).toBe(
      new URL(page.url()).origin
    );
    expect(
      sent.url().startsWith(coreApiPublicBase),
      `${appLabel} must not reach the Core public base directly`
    ).toBe(false);
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

async function assertNoWildcardCors(page: Page, request: APIRequestContext): Promise<void> {
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
