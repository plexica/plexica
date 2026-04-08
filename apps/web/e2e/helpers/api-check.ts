// api-check.ts
// Stack connectivity helpers for E2E tests.
// Tests skip gracefully when the stack (API, Keycloak) is not running.

const API_BASE = process.env['PLAYWRIGHT_API_URL'] ?? 'http://localhost:3001';
const MAILPIT_BASE = process.env['PLAYWRIGHT_MAILPIT_URL'] ?? 'http://localhost:8025';

/**
 * Returns true when the core API is reachable.
 * Uses a lightweight health-check endpoint — no auth required.
 */
export async function isApiReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(3_000) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Returns true when Mailpit SMTP UI is reachable.
 */
export async function isMailpitReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${MAILPIT_BASE}/api/v1/messages`, {
      signal: AbortSignal.timeout(3_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Returns true when both the API and Keycloak are reachable.
 * Quick pre-condition check before individual tests.
 */
export async function isStackReachable(): Promise<boolean> {
  const keycloakUrl = process.env['PLAYWRIGHT_KEYCLOAK_URL'] ?? '';
  if (keycloakUrl.length === 0) return false;
  try {
    const [apiOk, kcRes] = await Promise.all([
      isApiReachable(),
      fetch(`${keycloakUrl}/health/ready`, { signal: AbortSignal.timeout(3_000) }),
    ]);
    return apiOk && kcRes.ok;
  } catch {
    return false;
  }
}

export { API_BASE, MAILPIT_BASE };
