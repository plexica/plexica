/**
 * SSRF prevention helpers for Keycloak service.
 *
 * All outbound `fetch()` calls to Keycloak-constructed URLs MUST pass through
 * `assertKeycloakUrl()` before the network call is made. This ensures that a
 * manipulated realm name or redirect URI cannot cause the server to issue
 * requests to arbitrary hosts (Server-Side Request Forgery).
 *
 * Resolves CodeQL alerts: js/request-forgery (#1, #2, #3).
 * See: .forge/specs/015-security-hardening/spec.md FR-001, FR-002
 */

/**
 * Read `KEYCLOAK_URL` from the environment, parse it, and return a normalized
 * `URL` object representing the expected Keycloak base origin.
 *
 * Normalization rules:
 * - Trailing slashes are stripped from the hostname comparison.
 * - Port 443 on HTTPS and port 80 on HTTP are treated as equivalent to
 *   an omitted port (the URL parser handles this automatically).
 *
 * @throws {Error} If `KEYCLOAK_URL` is missing or not a valid URL.
 */
export function getKeycloakBaseUrl(): URL {
  const raw = process.env.KEYCLOAK_URL;

  if (!raw || raw.trim() === '') {
    throw new Error(
      'KEYCLOAK_URL environment variable is not set or invalid: ' +
        'set KEYCLOAK_URL to the base URL of your Keycloak instance ' +
        '(e.g. https://keycloak.internal:8443)'
    );
  }

  try {
    return new URL(raw.trim());
  } catch {
    throw new Error(
      `KEYCLOAK_URL environment variable is not set or invalid: "${raw}" is not a valid URL`
    );
  }
}

/**
 * Assert that `url` resolves to the same origin (protocol + hostname + port)
 * as the configured `KEYCLOAK_URL`. Throws immediately if the origins differ,
 * blocking the outbound `fetch()` call.
 *
 * Usage — call this **before** every `fetch()` that uses a Keycloak-derived URL:
 *
 * ```ts
 * assertKeycloakUrl(tokenEndpoint);
 * const response = await fetch(tokenEndpoint, { ... });
 * ```
 *
 * @param url - The fully-constructed URL about to be used in a `fetch()` call.
 * @throws {Error} With code `SSRF_BLOCKED` if the URL origin does not match
 *   the configured Keycloak base URL.
 * @throws {Error} If `KEYCLOAK_URL` is misconfigured or `url` is not parseable.
 */
export function assertKeycloakUrl(url: string): void {
  const base = getKeycloakBaseUrl();

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`SSRF_BLOCKED: constructed URL is not a valid URL: "${url}"`);
  }

  // Compare protocol and hostname. The URL constructor normalises port numbers
  // (e.g. https://host:443 → port '' because 443 is the default for https),
  // so `parsed.hostname` and `parsed.port` already handle port normalisation.
  const originMatch =
    parsed.protocol === base.protocol &&
    parsed.hostname === base.hostname &&
    parsed.port === base.port;

  if (!originMatch) {
    throw new Error(
      'SSRF_BLOCKED: constructed URL does not match configured KEYCLOAK_URL ' +
        `(expected origin "${base.protocol}//${base.hostname}${base.port ? ':' + base.port : ''}", ` +
        `got "${parsed.protocol}//${parsed.hostname}${parsed.port ? ':' + parsed.port : ''}")`
    );
  }
}
