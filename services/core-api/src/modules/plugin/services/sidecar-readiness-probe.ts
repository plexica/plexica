const RETRYABLE_ERROR_CODES = new Set(['ECONNREFUSED', 'ECONNRESET']);

export const SIDECAR_PROBE_MAX_ATTEMPTS = 20;
export const SIDECAR_PROBE_INTERVAL_MS = 1_000;

export interface SidecarProbeOptions {
  url: string;
  maxAttempts?: number;
  intervalMs?: number;
  fetchImpl?: typeof globalThis.fetch;
  delayImpl?: (ms: number) => Promise<void>;
}

function errorCode(value: unknown): string | undefined {
  if (
    value instanceof Error ||
    (value !== null && typeof value === 'object' && 'code' in value)
  ) {
    const code = (value as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return undefined;
}

// Startup race (run 32928703905): the harness container is running before the
// Node server inside has bound its port, so the first proxy attempt fails with
// ECONNREFUSED. Only these transport-level failures are transient; any HTTP
// response — even a 5xx — proves the server is up and must be surfaced as-is.
function isStartupNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    RETRYABLE_ERROR_CODES.has(errorCode(error) ?? '') ||
    RETRYABLE_ERROR_CODES.has(errorCode(error.cause) ?? '')
  );
}

export async function probeSidecarEndpoint({
  url,
  maxAttempts = SIDECAR_PROBE_MAX_ATTEMPTS,
  intervalMs = SIDECAR_PROBE_INTERVAL_MS,
  fetchImpl = globalThis.fetch,
  delayImpl = (ms) =>
    new Promise<void>((resolveDelay) => setTimeout(resolveDelay, ms)),
}: SidecarProbeOptions): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fetchImpl(url);
    } catch (error) {
      lastError = error;
      if (!isStartupNetworkError(error) || attempt === maxAttempts) throw error;
      await delayImpl(intervalMs);
    }
  }
  throw lastError;
}
