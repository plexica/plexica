// api-client.ts
// Admin API helper for E2E test assertions + setup/cleanup.
//
// Wraps the /api/v1/admin/* endpoints exposed by core-api. All endpoints
// require a master-realm super_admin bearer token. The default token is read
// from process.env['PLAYWRIGHT_ADMIN_API_TOKEN'] (set by global-setup.ts); an
// explicit token can be passed for cases where a test freshly logs in.
//
// Read methods (assertions) return `unknown` so callers assert on the shape
// they expect. Lifecycle methods (provision/suspend/reactivate/delete) are
// typed so setup/cleanup code in afterAll can read tenantId/version/slugs
// without casting. Every method throws on non-2xx so failures surface fast.

const CORE_API_BASE = process.env['PLAYWRIGHT_CORE_API_URL'] ?? 'http://localhost:3001';
const ADMIN_API_BASE = `${CORE_API_BASE}/api/v1/admin`;

// ── Response shapes used by setup/cleanup ────────────────────────────────────
// Kept minimal (only the fields tests read) and stringly-typed for status
// enums so cleanup never breaks when the backend widens an enum.

export interface TenantRow {
  id: string;
  slug: string;
  name: string;
  status: string;
  version: number;
  createdAt: string;
}

export interface TenantListResponse {
  data: TenantRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface TenantDetailResponse {
  tenant: {
    id: string;
    slug: string;
    name: string;
    status: string;
    version: number;
    createdAt: string;
    updatedAt: string;
    minioBucket: string | null;
  };
  userCount: number;
  workspaceCount: number;
  pluginInstallations: unknown[];
  recentAudit: unknown[];
}

export interface ProvisionResult {
  tenantId: string;
  slug: string;
  schemaName: string;
  realmName: string;
  minioBucket: string;
  tempPassword: string;
}

export interface DeletionStep {
  id: string;
  step: string;
  status: string;
  attempts: number;
  lastError: string | null;
  updatedAt: string;
}

export interface DeletionStatusResponse {
  steps: DeletionStep[];
}

export interface PluginRow {
  id: string;
  slug: string;
  name: string;
  version: string;
  status: string;
  reviewStatus: string;
  installedCount: number;
}

export interface PluginListResponse {
  data: PluginRow[];
  total: number;
  page: number;
  pageSize: number;
}

async function req(
  token: string,
  method: string,
  path: string,
  body?: unknown
): Promise<unknown> {
  const res = await fetch(`${ADMIN_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Admin API ${method} ${path} failed: ${res.status} ${text}`);
  }
  const text = await res.text();
  return text.length === 0 ? null : JSON.parse(text);
}

export interface AdminApiClient {
  // Read endpoints (assertions).
  getHealth(): Promise<unknown>;
  listTenants(): Promise<unknown>;
  getTenant(id: string): Promise<unknown>;
  getDashboardMetrics(): Promise<unknown>;
  getKafkaStatus(): Promise<unknown>;
  getAuditLog(): Promise<unknown>;
  getLogs(): Promise<unknown>;
  // Lifecycle endpoints (setup/cleanup).
  findTenantBySlug(slug: string): Promise<TenantRow | undefined>;
  getTenantDetail(id: string): Promise<TenantDetailResponse>;
  provisionTenant(input: { slug: string; name: string; adminEmail: string }): Promise<ProvisionResult>;
  suspendTenant(id: string, version: number): Promise<unknown>;
  reactivateTenant(id: string, version: number): Promise<unknown>;
  deleteTenant(id: string, confirmSlug: string, version: number): Promise<unknown>;
  getDeletionStatus(id: string): Promise<DeletionStatusResponse>;
  listPlugins(): Promise<PluginListResponse>;
  reviewPlugin(slug: string, decision: 'approve' | 'reject', notes?: string): Promise<unknown>;
  ensureActive(id: string): Promise<void>;
}

/**
 * Builds an admin API client bound to the given bearer token.
 * If no token is provided, reads from PLAYWRIGHT_ADMIN_API_TOKEN env var
 * (set by global-setup.ts and propagated to worker processes by Playwright).
 */
export function adminApi(token?: string): AdminApiClient {
  // Fallback chain: explicit token → process.env (set by global-setup.ts).
  const bearer = token ?? process.env['PLAYWRIGHT_ADMIN_API_TOKEN'] ?? '';
  if (bearer.length === 0) {
    throw new Error(
      'adminApi: no bearer token available — pass one or set PLAYWRIGHT_ADMIN_API_TOKEN.'
    );
  }
  const get = (path: string): Promise<unknown> => req(bearer, 'GET', path);

  return {
    getHealth: () => get('/health'),
    listTenants: () => get('/tenants'),
    getTenant: (id: string) => get(`/tenants/${encodeURIComponent(id)}`),
    getDashboardMetrics: () => get('/dashboard/metrics'),
    getKafkaStatus: () => get('/system/kafka'),
    getAuditLog: () => get('/audit-logs'),
    getLogs: () => get('/logs'),

    findTenantBySlug: async (slug: string) => {
      const list = (await get(
        `/tenants?search=${encodeURIComponent(slug)}&pageSize=100`
      )) as TenantListResponse;
      return list.data.find((t) => t.slug === slug);
    },
    getTenantDetail: (id: string) =>
      get(`/tenants/${encodeURIComponent(id)}`) as Promise<TenantDetailResponse>,
    provisionTenant: (input) =>
      req(bearer, 'POST', '/tenants', input) as Promise<ProvisionResult>,
    suspendTenant: (id, version) => req(bearer, 'POST', `/tenants/${id}/suspend`, { version }),
    reactivateTenant: (id, version) => req(bearer, 'POST', `/tenants/${id}/reactivate`, { version }),
    deleteTenant: (id, confirmSlug, version) =>
      req(bearer, 'DELETE', `/tenants/${id}`, { confirmSlug, version }),
    getDeletionStatus: (id) =>
      get(`/tenants/${id}/deletion-status`) as Promise<DeletionStatusResponse>,
    listPlugins: () => get('/plugins') as Promise<PluginListResponse>,
    reviewPlugin: (slug, decision, notes) =>
      req(bearer, 'POST', `/plugins/${encodeURIComponent(slug)}/review`, {
        decision,
        ...(notes !== undefined ? { notes } : {}),
      }),
    ensureActive: async (id: string) => {
      const detail = await (get(`/tenants/${id}`) as Promise<TenantDetailResponse>);
      if (detail.tenant.status === 'suspended') {
        await req(bearer, 'POST', `/tenants/${id}/reactivate`, {
          version: detail.tenant.version,
        });
      }
    },
  };
}
