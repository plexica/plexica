// api-client.ts
// Admin API helper for E2E test assertions.
//
// Wraps the /api/v1/admin/* endpoints exposed by core-api. All endpoints
// require a master-realm super_admin bearer token. The default token is read
// from process.env['PLAYWRIGHT_ADMIN_API_TOKEN'] (set by global-setup.ts); an
// explicit token can be passed for cases where a test freshly logs in.
//
// Each method returns the parsed JSON body (typed as `unknown` so callers can
// assert on the shape they expect) and throws on non-2xx responses so test
// failures surface immediately with a meaningful error.

const CORE_API_BASE = process.env['PLAYWRIGHT_CORE_API_URL'] ?? 'http://localhost:3001';
const ADMIN_API_BASE = `${CORE_API_BASE}/api/v1/admin`;

export interface AdminApiClient {
  getHealth(): Promise<unknown>;
  listTenants(): Promise<unknown>;
  getTenant(id: string): Promise<unknown>;
  getDashboardMetrics(): Promise<unknown>;
  getKafkaStatus(): Promise<unknown>;
  getAuditLog(): Promise<unknown>;
  getLogs(): Promise<unknown>;
}

async function request(token: string, path: string): Promise<unknown> {
  const res = await fetch(`${ADMIN_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Admin API ${path} failed: ${res.status} ${body}`);
  }
  // Some endpoints (e.g. health) may return empty 204 — guard JSON parsing.
  const text = await res.text();
  return text.length === 0 ? null : JSON.parse(text);
}

/**
 * Builds an admin API client bound to the given bearer token.
 * If no token is provided, falls back to the one provisioned by global-setup.
 */
export function adminApi(token?: string): AdminApiClient {
  const bearer = token ?? process.env['PLAYWRIGHT_ADMIN_API_TOKEN'] ?? '';
  if (bearer.length === 0) {
    throw new Error(
      'adminApi: no bearer token available — pass one or set PLAYWRIGHT_ADMIN_API_TOKEN.'
    );
  }
  return {
    getHealth: () => request(bearer, '/health'),
    listTenants: () => request(bearer, '/tenants'),
    getTenant: (id: string) => request(bearer, `/tenants/${encodeURIComponent(id)}`),
    getDashboardMetrics: () => request(bearer, '/dashboard/metrics'),
    getKafkaStatus: () => request(bearer, '/system/kafka'),
    getAuditLog: () => request(bearer, '/audit-logs'),
    getLogs: () => request(bearer, '/logs'),
  };
}
