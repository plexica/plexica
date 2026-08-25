// plugin-proxy-retry.ts
// Bounded retry for plugin-proxy requests (live run 32833067545): right after
// install activation the CRM sidecar may still be starting, so Core answers a
// 502-class PLUGIN_BACKEND_UNREACHABLE before the backend bound its port.
// Retry network errors and >=500 within a bounded window instead of failing
// on a startup race; 2xx-4xx responses are final.

export interface PluginProxyAttemptResult {
  status: number;
  body: string;
}

export interface PluginProxyRetryOptions {
  intervalMs: number;
  timeoutMs: number;
}

export const PLUGIN_PROXY_RETRY_DEFAULTS: PluginProxyRetryOptions = {
  intervalMs: 1_000,
  timeoutMs: 20_000,
};

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
