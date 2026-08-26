// ci-runtime-contract-flow.test.ts
// Regression guard for live run 32833067545: right after install activation the
// CRM sidecar was still starting ("health: starting"), so the plugin-proxy
// request hit a 502-class PLUGIN_BACKEND_UNREACHABLE before the app bound its
// port. The contract flow must retry bounded instead of failing the run.

import { describe, expect, it } from 'vitest';

import { pluginProxyRequestWithRetry } from './ci-runtime-contract-flow.js';

import type { PluginProxyAttemptResult } from './ci-runtime-contract-flow.js';

const FAST_RETRY = {
  intervalMs: 1,
  timeoutMs: 250,
};

function unreachableBody(status = 502): PluginProxyAttemptResult {
  return { status, body: JSON.stringify({ error: 'PLUGIN_BACKEND_UNREACHABLE' }) };
}

describe('pluginProxyRequestWithRetry', () => {
  it('succeeds on the second attempt after a startup-race 502', async () => {
    const attempts: PluginProxyAttemptResult[] = [
      unreachableBody(),
      { status: 200, body: '{"status":"healthy"}' },
    ];
    let calls = 0;
    const result = await pluginProxyRequestWithRetry(
      async () => {
        const attempt = attempts[calls++];
        if (attempt === undefined) throw new Error('no more scripted attempts');
        return attempt;
      },
      FAST_RETRY
    );
    expect(calls).toBe(2);
    expect(result).toEqual({ status: 200, body: '{"status":"healthy"}' });
  });

  it('retries network errors and succeeds once the backend answers', async () => {
    let calls = 0;
    const result = await pluginProxyRequestWithRetry(
      async () => {
        calls++;
        if (calls === 1) throw new TypeError('Failed to fetch');
        return { status: 200, body: 'healthy' };
      },
      FAST_RETRY
    );
    expect(calls).toBe(2);
    expect(result.status).toBe(200);
  });

  it('throws on exhaustion and reports the last status and body', async () => {
    let calls = 0;
    await expect(
      pluginProxyRequestWithRetry(
        async () => {
          calls++;
          return unreachableBody();
        },
        FAST_RETRY
      )
    ).rejects.toThrow(/last status=502.*PLUGIN_BACKEND_UNREACHABLE/s);
    expect(calls).toBeGreaterThan(1);
  });

  it('treats any 2xx-4xx response as final without retrying', async () => {
    const statuses = [200, 301, 400, 404];
    for (const status of statuses) {
      let calls = 0;
      const result = await pluginProxyRequestWithRetry(
        async () => {
          calls++;
          return { status, body: 'final' };
        },
        FAST_RETRY
      );
      expect(calls, `status ${status} must not be retried`).toBe(1);
      expect(result).toEqual({ status, body: 'final' });
    }
  });

  it('reports the last network error when every attempt fails to connect', async () => {
    await expect(
      pluginProxyRequestWithRetry(
        async () => {
          throw new TypeError('Failed to fetch');
        },
        FAST_RETRY
      )
    ).rejects.toThrow(/last network error: TypeError: Failed to fetch/);
  });
});
