// url-guard.ts
// URL safety guard for the plugin SDK (CWE-319): bearer/service tokens must
// not travel over cleartext HTTP to PUBLIC hosts. Allowed over http: are
// loopback hosts (local dev) and single-label service names (Docker/K8s
// internal network, e.g. "core-api-e2e" — not exposed cleartext). Any
// dotted public hostname requires HTTPS.
// Split out of plugin-sdk.ts to keep it under the 200-line gate.

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
// IP literal detection: an IPv4 has 4 dot-separated octets, a bare IPv6 (as
// produced after bracket normalization) contains colons. Neither may use the
// dotless "internal service name" exception (CodeRabbit): http://[2001:db8::1]
// must not bypass the guard.
const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * Returns when the URL is safe to send credentials to, otherwise throws.
 * Allowed: https: to any host; http: to loopback hosts or single-label DNS
 * service names (Docker/K8s internal network, e.g. "core-api-e2e").
 */
export function assertSecureApiUrl(apiUrl: string): void {
  const parsed = new URL(apiUrl);
  // new URL().hostname brackets IPv6 ("[::1]"); normalize for the loopback set.
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  const isLoopback = LOOPBACK_HOSTS.has(host);
  const isIpLiteral = IPV4_RE.test(host) || host.includes(':');
  const isInternalServiceName = !isIpLiteral && !host.includes('.') && host !== '';
  if (parsed.protocol === 'http:' && !isLoopback && !isInternalServiceName) {
    throw new Error(
      `Refusing cleartext HTTP to non-loopback public Core API URL "${apiUrl}" (CWE-319). Use HTTPS or an internal service name.`
    );
  }
}