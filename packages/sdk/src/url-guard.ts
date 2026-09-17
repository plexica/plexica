// url-guard.ts
// URL safety guard for the plugin SDK (CWE-319): bearer/service tokens must
// not travel over cleartext HTTP to PUBLIC hosts. Allowed over http: are
// loopback hosts (local dev) and single-label internal service names
// (Docker/K8s internal network, e.g. "core-api-e2e") — the latter ONLY when
// the caller opts in via an explicit allowlist (allowHttpHosts) or the
// allowHttpInternal escape hatch (F9, CodeRabbit): a single-label hostname
// alone cannot authorize cleartext credential transport. Any dotted public
// hostname requires HTTPS.
// Split out of plugin-sdk.ts to keep it under the 200-line gate.

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
// IP literal detection: an IPv4 has 4 dot-separated octets, a bare IPv6 (as
// produced after bracket normalization) contains colons. Neither may use the
// dotless "internal service name" exception (CodeRabbit): http://[2001:db8::1]
// must not bypass the guard.
const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * Optional opt-in for cleartext http: to single-label internal service names.
 * Either the explicit hostname allowlist or the blanket allowHttpInternal
 * flag must be present for such hosts; absent both, the guard rejects them.
 */
export interface SecureApiUrlOptions {
  allowHttpHosts?: string[];
  allowHttpInternal?: boolean;
}

/**
 * Returns when the URL is safe to send credentials to, otherwise throws.
 * Allowed: https: to any host; http: to loopback hosts; http: to single-label
 * internal service names (Docker/K8s, e.g. "core-api-e2e") only when the host
 * is in `allowHttpHosts` or `allowHttpInternal` is true.
 */
export function assertSecureApiUrl(apiUrl: string, options: SecureApiUrlOptions = {}): void {
  const parsed = new URL(apiUrl);
  // new URL().hostname brackets IPv6 ("[::1]"); normalize for the loopback set.
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  const isLoopback = LOOPBACK_HOSTS.has(host);
  const isIpLiteral = IPV4_RE.test(host) || host.includes(':');
  const isInternalServiceName = !isIpLiteral && !host.includes('.') && host !== '';
  const isAllowlistedInternal =
    isInternalServiceName &&
    ((options.allowHttpHosts ?? []).includes(host) || options.allowHttpInternal === true);
  if (parsed.protocol === 'http:' && !isLoopback && !isAllowlistedInternal) {
    throw new Error(
      `Refusing cleartext HTTP to non-loopback Core API URL "${apiUrl}" (CWE-319). Use HTTPS, or for an internal single-label service host authorize it explicitly via PluginConfig.allowHttpHosts/allowHttpInternal.`
    );
  }
}

/**
 * Removes trailing slashes from a base URL in linear time (no regex, no
 * backtracking — CodeQL js/polynomial-redos safe). Used when joining a base
 * URL with an API path so the join never produces "//".
 */
export function trimTrailingSlashes(url: string): string {
  let end = url.length;
  while (end > 0 && url.charCodeAt(end - 1) === 47 /* '/' */) {
    end -= 1;
  }
  return url.slice(0, end);
}