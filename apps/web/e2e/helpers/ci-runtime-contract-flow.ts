import { expect } from '@playwright/test';

import { ciRuntimeManifest } from '../../../../e2e/ci-runtime-manifest.js';


import { loginAsAdmin, uniqueName } from './admin-login.js';
import { createWorkspaceFixture, ensureCrmInstalled, getBrowserToken } from './plugin-fixtures.js';

import type { APIRequestContext, Page, Response } from '@playwright/test';

export interface CiRuntimeContractFlowOptions {
  appLabel: string;
  baseUrl: string;
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
  const ordinary = waitForContractResponse(page, '/api/health', 'ordinary');
  const pluginPathname = `/api/v1/plugins/${installId}/proxy/_plexica/health`;
  const plugin = waitForContractResponse(page, pluginPathname, 'plugin');
  const result = await page.evaluate(async ({ accessToken, installation, workspace }) => {
    const headers = { Authorization: `Bearer ${accessToken}`, 'X-Plexica-Workspace-Id': workspace };
    const [ordinaryResponse, pluginResponse] = await Promise.all([
      fetch('/api/health?contract=ordinary'),
      fetch(`/api/v1/plugins/${installation}/proxy/_plexica/health?contract=plugin`, {
        credentials: 'include',
        headers,
      }),
    ]);
    return {
      ordinary: { status: ordinaryResponse.status, body: await ordinaryResponse.json() },
      plugin: { status: pluginResponse.status, body: await pluginResponse.text() },
    };
  }, { accessToken: token, installation: installId, workspace: workspaceId });
  await assertSameOriginContract(
    page,
    runtime.CORE_API_PUBLIC_BASE,
    [await ordinary, await plugin],
    token,
    workspaceId,
    options.appLabel
  );
  await assertNoWildcardCors(page, request);
  expect(result.ordinary).toEqual({ status: 200, body: { status: 'ok', version: '2.0.0' } });
  expect(result.plugin.status, result.plugin.body).toBeGreaterThanOrEqual(200);
  expect(result.plugin.status, result.plugin.body).toBeLessThan(300);
  expect(result.plugin.body).toContain('healthy');
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
  const probe = await request.fetch(`${new URL(page.url()).origin}/api/health?contract=cors-probe`, {
    headers: { Origin: 'http://evil.example' },
  });
  const allowOrigin = probe.headers()['access-control-allow-origin'];
  expect(allowOrigin, 'CI contract forbids wildcard CORS on cross-origin API probes').not.toBe('*');
  expect(allowOrigin, 'CI contract forbids reflecting foreign origins').not.toBe(
    'http://evil.example'
  );
}
