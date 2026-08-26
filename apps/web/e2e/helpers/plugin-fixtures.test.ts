// plugin-fixtures.test.ts
// Behavioral regression guard for the E2E fixture helpers (see
// ./plugin-fixtures.fakes.ts for the JSON-body contract from live run
// 32754231611). Proxy warm-up behavior has its own suite in
// ./plugin-warmup.test.ts.

import { describe, expect, it } from 'vitest';

import { API_TIMEOUT_MS } from '../../../../e2e/playwright-base.js';

import { ensureCrmInstalled } from './crm-plugin-fixture.js';
import {
  assertJsonPostsCarryBody,
  assertRequestsCarryApiTimeout,
  fakePage,
} from './plugin-fixtures.fakes.js';
import { createWorkspaceFixture } from './plugin-fixtures.js';

describe('plugin e2e fixtures', () => {
  it('ensureCrmInstalled sends an explicit empty JSON body on install and activates on first poll', async () => {
    let installationsRequested = false;
    const { page, requests } = fakePage((req) => {
      if (req.url.endsWith('/api/v1/plugins/installed')) {
        return {
          status: 200,
          body: installationsRequested ? [{ id: 'install-1', pluginSlug: 'crm', status: 'active' }] : [],
        };
      }
      if (req.url.endsWith('/api/v1/plugins/crm/install')) {
        installationsRequested = true;
        return { status: 200, body: { status: 'active', installId: 'install-1', slug: 'crm' } };
      }
      if (req.method === 'POST' && req.url.endsWith('/api/v1/workspaces')) {
        return { status: 201, body: { id: 'ws-warmup' } };
      }
      if (req.url.includes('/proxy/_plexica/health')) {
        return { status: 200, body: { status: 'healthy' } };
      }
      if (req.method === 'DELETE' && req.url.endsWith('/api/v1/workspaces/ws-warmup')) {
        return { status: 204 };
      }
      throw new Error(`Unexpected request: ${req.method} ${req.url}`);
    });

    const installId = await ensureCrmInstalled(page, 'token-123', {
      pollIntervalMs: 5,
      timeoutMs: 5000,
      warmup: { intervalMs: 1, timeoutMs: 250 },
    });

    expect(installId).toBe('install-1');
    const install = requests.find((req) => req.url.endsWith('/api/v1/plugins/crm/install'));
    expect(install?.options?.headers?.['Content-Type']).toBe('application/json');
    // Regression guard for run 32754231611: the install POST must carry a
    // serializable (possibly empty) JSON body, never a header-only payload.
    expect(install?.options?.data).toEqual({});
    assertJsonPostsCarryBody(requests);
    // Regression guard for run 32934334508: every fixture API call carries the
    // explicit 30s timeout so install/uninstall survives CI load.
    assertRequestsCarryApiTimeout(requests, API_TIMEOUT_MS);
  });

  it('ensureCrmInstalled polls until the installation reads active on a later poll', async () => {
    let installedReads = 0;
    const { page, requests } = fakePage((req) => {
      if (req.url.endsWith('/api/v1/plugins/installed')) {
        installedReads += 1;
        if (installedReads === 2) {
          return {
            status: 200,
            body: [{ id: 'install-1', pluginSlug: 'crm', status: 'active' }],
          };
        }
        return { status: 200, body: [] };
      }
      if (req.url.endsWith('/api/v1/plugins/crm/install')) {
        return { status: 200, body: { status: 'installing', installId: 'install-1', slug: 'crm' } };
      }
      if (req.method === 'POST' && req.url.endsWith('/api/v1/workspaces')) {
        return { status: 201, body: { id: 'ws-warmup' } };
      }
      if (req.url.includes('/proxy/_plexica/health')) {
        return { status: 200, body: { status: 'healthy' } };
      }
      if (req.method === 'DELETE' && req.url.endsWith('/api/v1/workspaces/ws-warmup')) {
        return { status: 204 };
      }
      throw new Error(`Unexpected request: ${req.method} ${req.url}`);
    });

    const installId = await ensureCrmInstalled(page, 'token-123', {
      pollIntervalMs: 5,
      timeoutMs: 5000,
      warmup: { intervalMs: 1, timeoutMs: 250 },
    });

    expect(installId).toBe('install-1');
    expect(installedReads).toBeGreaterThanOrEqual(2);
    assertJsonPostsCarryBody(requests);
  });

  it('ensureCrmInstalled reports observed status and install-response fields on poll exhaustion', async () => {
    let installedReads = 0;
    const { page } = fakePage((req) => {
      if (req.url.endsWith('/api/v1/plugins/installed')) {
        installedReads += 1;
        if (installedReads === 1) return { status: 200, body: [] };
        return {
          status: 200,
          body: [{ id: 'install-1', pluginSlug: 'crm', status: 'degraded' }],
        };
      }
      if (req.url.endsWith('/api/v1/plugins/crm/install')) {
        return { status: 200, body: { status: 'degraded', degraded: true, installId: 'install-1', slug: 'crm' } };
      }
      throw new Error(`Unexpected request: ${req.method} ${req.url}`);
    });

    await expect(
      ensureCrmInstalled(page, 'token-123', { pollIntervalMs: 5, timeoutMs: 30 })
    ).rejects.toThrow(
      /was not activated within 30ms; last observed crm installation status: 'degraded'; install response reported: status='degraded', degraded=true/
    );
    expect(installedReads).toBeGreaterThanOrEqual(2);
  });

  it('ensureCrmInstalled reports missing installation when no crm row ever appears', async () => {
    const { page } = fakePage((req) => {
      if (req.url.endsWith('/api/v1/plugins/installed')) {
        return { status: 200, body: [] };
      }
      if (req.url.endsWith('/api/v1/plugins/crm/install')) {
        return { status: 200, body: { installId: 'install-1', slug: 'crm' } };
      }
      throw new Error(`Unexpected request: ${req.method} ${req.url}`);
    });

    await expect(
      ensureCrmInstalled(page, 'token-123', { pollIntervalMs: 5, timeoutMs: 30 })
    ).rejects.toThrow(/last observed crm installation status: 'missing'; install response reported: <no status\/degraded fields>/);
  });

  it('createWorkspaceFixture posts its payload with a JSON body', async () => {
    const { page, requests } = fakePage((req) => {
      if (req.method === 'POST' && req.url.endsWith('/api/v1/workspaces')) {
        return { status: 201, body: { id: 'ws-1' } };
      }
      throw new Error(`Unexpected request: ${req.method} ${req.url}`);
    });

    const workspaceId = await createWorkspaceFixture(page, 'token-123', 'e2e-ws');

    expect(workspaceId).toBe('ws-1');
    assertJsonPostsCarryBody(requests);
    assertRequestsCarryApiTimeout(requests, API_TIMEOUT_MS);
  });
});
