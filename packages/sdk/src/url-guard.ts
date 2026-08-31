// url-guard.ts
// URL safety guard for the plugin SDK (CWE-319): bearer/service tokens must
// not travel over cleartext HTTP unless the target is loopback (local dev).
// Split out of plugin-sdk.ts to keep it under the 200-line gate.

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

/**
 * Returns the parsed URL when it is safe to send credentials to, otherwise
 * throws. Allowed: any https: URL, or http: only to a loopback host.
 */
export function assertSecureApiUrl(apiUrl: string): void {
  const parsed = new URL(apiUrl);
  // new URL().hostname brackets IPv6 ("[::1]"); normalize for the loopback set.
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  if (parsed.protocol === 'http:' && !LOOPBACK_HOSTS.has(host)) {
    throw new Error(
      `Refusing cleartext HTTP to non-loopback Core API URL "${apiUrl}" (CWE-319). Use HTTPS in non-local deployments.`
    );
  }
}