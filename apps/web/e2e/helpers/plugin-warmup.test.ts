// plugin-warmup.test.ts
// Regression guard for live run 32906681327: right after install activation
// the CRM sidecar was still cold, so the first proxied request timed out with
// PLUGIN_BACKEND_UNREACHABLE. ensureCrmInstalled must warm the backend through
// the real proxy health path before returning, retrying >=500 responses within
// a bounded window, throwing on exhaustion, and cleaning the scratch workspace
// up either way.

import { describe, expect, it } from 'vitest';

import { ensureCrmInstalled } from './crm-plugin-fixture.js';
import { fakePage } from './plugin-fixtures.fakes.js';

import type { Page } from '@playwright/test';

const FAST_WARMUP = { intervalMs: 1, timeoutMs: 250 };

function coldStartFixture(health: (call: number) => { status: number; body?: unknown }): {
  page: Page;
  healthCalls: () => number;
  deletedScratchWorkspace: () => boolean;
} {
  let calls = 0;
  let deleted = false;
  let installed = false;
  const { page } = fakePage((req) => {
    if (req.url.endsWith('/api/v1/plugins/installed')) {
      return {
        status: 200,
        body: installed ? [{ id: 'install-9', pluginSlug: 'crm', status: 'active' }] : [],
      };
    }
    if (req.url.endsWith('/api/v1/plugins/crm/install')) {
      installed = true;
      return { status: 200, body: { status: 'active', installId: 'install-9', slug: 'crm' } };
    }
    if (req.method === 'POST' && req.url.endsWith('/api/v1/workspaces')) {
      return { status: 201, body: { id: 'ws-warmup' } };
    }
    if (req.url.includes('/proxy/_plexica/health')) {
      calls += 1;
      return health(calls);
    }
    if (req.method === 'DELETE' && req.url.endsWith('/api/v1/workspaces/ws-warmup')) {
      deleted = true;
      return { status: 204 };
    }
    throw new Error(`Unexpected request: ${req.method} ${req.url}`);
  });
  return { page, healthCalls: () => calls, deletedScratchWorkspace: () => deleted };
}

describe('ensureCrmInstalled proxy warm-up', () => {
  it('succeeds after a cold-start 502 and deletes the scratch workspace', async () => {
    const { page, healthCalls, deletedScratchWorkspace } = coldStartFixture((call) =>
      call === 1 ? { status: 502, body: { error: 'PLUGIN_BACKEND_UNREACHABLE' } } : { status: 200 }
    );

    const installId = await ensureCrmInstalled(page, 'token-123', {
      pollIntervalMs: 5,
      timeoutMs: 5000,
      warmup: FAST_WARMUP,
    });

    expect(installId).toBe('install-9');
    expect(healthCalls()).toBe(2);
    expect(deletedScratchWorkspace()).toBe(true);
  });

  it('throws when the proxy never warms up within the retry window', async () => {
    let calls = 0;
    let installed = false;
    const { page } = fakePage((req) => {
      if (req.url.endsWith('/api/v1/plugins/installed')) {
        return {
          status: 200,
          body: installed ? [{ id: 'install-9', pluginSlug: 'crm', status: 'active' }] : [],
        };
      }
      if (req.url.endsWith('/api/v1/plugins/crm/install')) {
        installed = true;
        return { status: 200, body: { status: 'active', installId: 'install-9', slug: 'crm' } };
      }
      if (req.method === 'POST' && req.url.endsWith('/api/v1/workspaces')) {
        return { status: 201, body: { id: 'ws-warmup' } };
      }
      if (req.url.includes('/proxy/_plexica/health')) {
        calls += 1;
        return { status: 502, body: { error: 'PLUGIN_BACKEND_UNREACHABLE' } };
      }
      if (req.method === 'DELETE' && req.url.endsWith('/api/v1/workspaces/ws-warmup')) {
        return { status: 204 };
      }
      throw new Error(`Unexpected request: ${req.method} ${req.url}`);
    });

    await expect(
      ensureCrmInstalled(page, 'token-123', {
        pollIntervalMs: 5,
        timeoutMs: 5000,
        warmup: { intervalMs: 1, timeoutMs: 30 },
      })
    ).rejects.toThrow(
      /did not answer within 30ms retry window \(last status=502, body=.*PLUGIN_BACKEND_UNREACHABLE/s
    );
    expect(calls).toBeGreaterThan(1);
  });
});
