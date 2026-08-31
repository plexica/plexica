// url-guard.ts
// URL safety guard for the plugin SDK (CWE-319): bearer/service tokens must
// not travel over cleartext HTTP to PUBLIC hosts. Allowed over http: are
// loopback hosts (local dev) and single-label service names (Docker/K8s
// internal network, e.g. "core-api-e2e" — not exposed cleartext). Any
// dotted public hostname requires HTTPS.
// Split out of plugin-sdk.ts to keep it under the 200-line gate.

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

/**
 * Returns when the URL is safe to send credentials to, otherwise throws.
 * Allowed: https: to any host; http: to loopback or single-label (internal
 * service-name) hosts.
 */
export function assertSecureApiUrl(apiUrl: string): void {
  const parsed = new URL(apiUrl);
  // new URL().hostname brackets IPv6 ("[::1]"); normalize for the loopback set.
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  const isLoopback = LOOPBACK_HOSTS.has(host);
  const isInternalServiceName = !host.includes('.') && host !== '';
  if (parsed.protocol === 'http:' && !isLoopback && !isInternalServiceName) {
    throw new Error(
      `Refusing cleartext HTTP to non-loopback public Core API URL "${apiUrl}" (CWE-319). Use HTTPS or an internal service name.`
    );
  }
}