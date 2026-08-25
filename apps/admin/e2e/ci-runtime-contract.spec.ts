import { randomUUID } from 'node:crypto';

import { expect, test } from '@playwright/test';

import {
  assertNoWildcardCors,
  assertSameOriginResponse,
  browserFetchBody,
  waitForContractResponse,
} from '../../web/e2e/helpers/ci-runtime-contract-flow.js';
import { ciRuntimeManifest } from '../../../e2e/ci-runtime-manifest.js';
import { loginSuperAdminForContract } from './helpers/ci-contract-login.js';

// Spec 010 contract for the ADMIN frontend. Unlike the web flow, the session
// is the run-scoped master-realm super admin on the reconciled `plexica-admin`
// origin (see helpers/ci-contract-login.ts): the admin console is tenant-less,
// so the plugin-proxy leg proves same-origin ROUTING — the request must stay
// on the admin origin, traverse only the preview proxy to Core's authenticated
// router, and come back answered by Core (INVALID_TENANT_CONTEXT is the
// deterministic tenant-less verdict) instead of leaving the origin or failing
// at the proxy. The healthy-sidecar proof with a real install lives in the web
// contract spec.
test('CI admin preserves same-origin API and plugin proxy requests', async ({ page, request }) => {
  const runtime = ciRuntimeManifest();
  const token = await loginSuperAdminForContract(page, runtime.ADMIN_E2E_PUBLIC_BASE);

  const ordinaryWait = waitForContractResponse(page, '/api/v1/health', 'ordinary');
  const ordinaryResponsePromise = page.evaluate(async () => {
    const response = await fetch('/api/v1/health?contract=ordinary');
    return { status: response.status, body: await response.json() };
  });
  const [ordinaryWaited, ordinary] = await Promise.all([ordinaryWait, ordinaryResponsePromise]);

  const installId = randomUUID();
  const workspaceId = randomUUID();
  const pluginPathname = `/api/v1/plugins/${installId}/proxy/_plexica/health`;
  const pluginWait = waitForContractResponse(page, pluginPathname, 'plugin');
  const pluginResult = await browserFetchBody(page, `${pluginPathname}?contract=plugin`, {
    credentials: 'include',
    headers: { Authorization: `Bearer ${token}`, 'X-Plexica-Workspace-Id': workspaceId },
  });
  const pluginWaited = await pluginWait;

  await assertSameOriginResponse(page, runtime.CORE_API_PUBLIC_BASE, ordinaryWaited, 'admin');
  await assertSameOriginResponse(page, runtime.CORE_API_PUBLIC_BASE, pluginWaited, 'admin');
  expect(ordinaryWaited.request().method()).toBe('GET');
  expect(pluginWaited.request().method()).toBe('GET');
  expect(new URL(pluginWaited.url()).search).toBe('?contract=plugin');
  const pluginHeaders = await pluginWaited.request().allHeaders();
  expect(pluginHeaders.authorization).toBe(`Bearer ${token}`);
  expect(pluginHeaders['x-plexica-workspace-id']).toBe(workspaceId);
  await assertNoWildcardCors(page, request);

  expect(ordinary).toEqual({ status: 200, body: { status: 'ok', version: '2.0.0' } });
  expect(pluginResult.status, pluginResult.body).toBeGreaterThanOrEqual(400);
  expect(pluginResult.status, pluginResult.body).toBeLessThan(500);
  expect(pluginResult.body).toContain('INVALID_TENANT_CONTEXT');
  expect(await page.evaluate(() => window.__PLEXICA_RUNTIME_CONFIG__?.apiBase)).toBe('');
});
