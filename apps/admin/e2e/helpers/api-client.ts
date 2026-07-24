// api-client.ts
// Admin API helper for E2E test assertions + setup/cleanup.
//
// Wraps the /api/v1/admin/* endpoints exposed by core-api. All endpoints
// require a master-realm super_admin bearer token. Without an explicit browser
// token, each request obtains a fresh token from the ephemeral E2E client.
//
// Read assertions return `unknown`; setup and cleanup methods are typed.

import { getE2eApiToken } from '../../../../e2e/keycloak/ephemeral-client.js';

import type {
  DeletionStatusResponse,
  PluginListResponse,
  ProvisionResult,
  TenantDetailResponse,
  TenantListResponse,
  TenantRow,
} from './api-client-types.js';

export type {
  DeletionStatusResponse,
  PluginListResponse,
  PluginRow,
  ProvisionResult,
  TenantDetailResponse,
  TenantRow,
} from './api-client-types.js';

const CORE_API_BASE = process.env['PLAYWRIGHT_CORE_API_URL'] ?? 'http://localhost:3001';
const ADMIN_API_BASE = `${CORE_API_BASE}/api/v1/admin`;

async function req(
  token: string | undefined,
  method: string,
  path: string,
  body?: unknown
): Promise<unknown> {
  const bearer = token ?? (await getE2eApiToken());
  const res = await fetch(`${ADMIN_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${bearer}`,
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
  getLogs(params?: {
    tenant?: string;
    level?: string;
    start?: string;
    limit?: number;
  }): Promise<unknown>;
  // Lifecycle endpoints (setup/cleanup).
  findTenantBySlug(slug: string): Promise<TenantRow | undefined>;
  getTenantDetail(id: string): Promise<TenantDetailResponse>;
  provisionTenant(input: {
    slug: string;
    name: string;
    adminEmail: string;
  }): Promise<ProvisionResult>;
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
 * If no token is provided, obtains a fresh narrow-scope E2E token per request.
 */
export function adminApi(token?: string): AdminApiClient {
  const get = (path: string): Promise<unknown> => req(token, 'GET', path);

  return {
    getHealth: () => get('/health'),
    listTenants: () => get('/tenants'),
    getTenant: (id: string) => get(`/tenants/${encodeURIComponent(id)}`),
    getDashboardMetrics: () => get('/dashboard/metrics'),
    getKafkaStatus: () => get('/system/kafka'),
    getAuditLog: () => get('/audit-logs'),
    getLogs: (params = {}) => {
      const query = new URLSearchParams();
      if (params.tenant !== undefined) query.set('tenant', params.tenant);
      if (params.level !== undefined) query.set('level', params.level);
      if (params.start !== undefined) query.set('start', params.start);
      if (params.limit !== undefined) query.set('limit', String(params.limit));
      const suffix = query.size > 0 ? `?${query.toString()}` : '';
      return get(`/logs${suffix}`);
    },

    findTenantBySlug: async (slug: string) => {
      const list = (await get(
        `/tenants?search=${encodeURIComponent(slug)}&pageSize=100`
      )) as TenantListResponse;
      return list.data.find((t) => t.slug === slug);
    },
    getTenantDetail: (id: string) =>
      get(`/tenants/${encodeURIComponent(id)}`) as Promise<TenantDetailResponse>,
    provisionTenant: (input) => req(token, 'POST', '/tenants', input) as Promise<ProvisionResult>,
    suspendTenant: (id, version) => req(token, 'POST', `/tenants/${id}/suspend`, { version }),
    reactivateTenant: (id, version) => req(token, 'POST', `/tenants/${id}/reactivate`, { version }),
    deleteTenant: (id, confirmSlug, version) =>
      req(token, 'DELETE', `/tenants/${id}`, { confirmSlug, version }),
    getDeletionStatus: (id) =>
      get(`/tenants/${id}/deletion-status`) as Promise<DeletionStatusResponse>,
    listPlugins: () => get('/plugins') as Promise<PluginListResponse>,
    reviewPlugin: (slug, decision, notes) =>
      req(token, 'POST', `/plugins/${encodeURIComponent(slug)}/review`, {
        decision,
        ...(notes !== undefined ? { notes } : {}),
      }),
    ensureActive: async (id: string) => {
      const detail = await (get(`/tenants/${id}`) as Promise<TenantDetailResponse>);
      if (detail.tenant.status === 'suspended') {
        await req(token, 'POST', `/tenants/${id}/reactivate`, {
          version: detail.tenant.version,
        });
      }
    },
  };
}
