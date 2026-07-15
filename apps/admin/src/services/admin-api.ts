// admin-api.ts
// Typed Admin API methods. All calls target /api/v1/admin/* endpoints.
// Methods go through apiClient for auth + 401 handling.
// Implemented endpoints match the backend route ownership table (plan §3.4).

import { apiClient } from './api-client.js';

import type {
  AuditLogResponse,
  DashboardMetrics,
  DeletionRetryResponse,
  DeletionStatusResponse,
  HealthResponse,
  KafkaStatus,
  LogEntry,
  Plugin,
  ProvisionResult,
  TenantDetail,
  TenantListResponse,
} from '../types/admin-types.js';

const ADMIN_PREFIX = '/api/v1/admin';

// ── Dashboard (S5-B00 — to be implemented) ─────────────────────────────────

export function getDashboardMetrics(): Promise<DashboardMetrics> {
  return apiClient.get<DashboardMetrics>(`${ADMIN_PREFIX}/dashboard/metrics`);
}

// ── Tenants (S5-200: list, S5-300: detail, S5-400: provision, S5-500: lifecycle) ──

export interface ListTenantsParams {
  search?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export function listTenants(params: ListTenantsParams = {}): Promise<TenantListResponse> {
  const query = new URLSearchParams();
  if (params.search !== undefined) query.set('search', params.search);
  if (params.status !== undefined) query.set('status', params.status);
  if (params.page !== undefined) query.set('page', String(params.page));
  if (params.pageSize !== undefined) query.set('pageSize', String(params.pageSize));
  const qs = query.toString();
  return apiClient.get<TenantListResponse>(`${ADMIN_PREFIX}/tenants${qs !== '' ? `?${qs}` : ''}`);
}

export function getTenant(id: string): Promise<TenantDetail> {
  return apiClient.get<TenantDetail>(`${ADMIN_PREFIX}/tenants/${id}`);
}

export function provisionTenant(req: { slug: string; name: string; adminEmail: string }): Promise<ProvisionResult> {
  return apiClient.post<ProvisionResult>(`${ADMIN_PREFIX}/tenants`, req);
}

export function suspendTenant(id: string, version: number): Promise<unknown> {
  return apiClient.post<unknown>(`${ADMIN_PREFIX}/tenants/${id}/suspend`, { version });
}

export function reactivateTenant(id: string, version: number): Promise<unknown> {
  return apiClient.post<unknown>(`${ADMIN_PREFIX}/tenants/${id}/reactivate`, { version });
}

export function deleteTenant(id: string, confirmSlug: string, version: number): Promise<unknown> {
  return apiClient.delete<unknown>(`${ADMIN_PREFIX}/tenants/${id}`, { body: { confirmSlug, version } });
}

// ── Tenant deletion saga (S5-704) ──────────────────────────────────────────

export function getDeletionStatus(id: string): Promise<DeletionStatusResponse> {
  return apiClient.get<DeletionStatusResponse>(`${ADMIN_PREFIX}/tenants/${id}/deletion-status`);
}

export function retryDeletionStep(stepId: string): Promise<DeletionRetryResponse> {
  return apiClient.post<DeletionRetryResponse>(`${ADMIN_PREFIX}/deletions/${stepId}/retry`, {});
}

// ── Plugin catalog (S5-800: review, S5-801: publish/unpublish) ─────────────

export function listPlugins(): Promise<{ data: Plugin[], total: number, page: number, pageSize: number }> {
  return apiClient.get<{ data: Plugin[], total: number, page: number, pageSize: number }>(`${ADMIN_PREFIX}/plugins`);
}

export function reviewPlugin(slug: string, decision: 'approve' | 'reject', notes?: string): Promise<unknown> {
  return apiClient.post<unknown>(`${ADMIN_PREFIX}/plugins/${slug}/review`, { decision, notes });
}

// ── Health (S5-100: implemented) ───────────────────────────────────────────

export function getHealth(): Promise<HealthResponse> {
  return apiClient.get<HealthResponse>(`${ADMIN_PREFIX}/health`);
}

// ── Audit log (S5-301: service implemented, route pending) ─────────────────

export function getAuditLog(params: { action?: string; tenantId?: string; page?: number } = {}): Promise<AuditLogResponse> {
  const query = new URLSearchParams();
  if (params.action !== undefined) query.set('action', params.action);
  if (params.tenantId !== undefined) query.set('tenantId', params.tenantId);
  if (params.page !== undefined) query.set('page', String(params.page));
  const qs = query.toString();
  return apiClient.get<AuditLogResponse>(`${ADMIN_PREFIX}/audit-logs${qs !== '' ? `?${qs}` : ''}`);
}

// ── System logs (S5-A00 — to be implemented, Loki query proxy) ──────────────

export function getLogs(params: { tenant?: string; level?: string; limit?: number } = {}): Promise<{ logs: LogEntry[], total: number }> {
  const query = new URLSearchParams();
  if (params.tenant !== undefined) query.set('tenant', params.tenant);
  if (params.level !== undefined) query.set('level', params.level);
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  const qs = query.toString();
  return apiClient.get<{ logs: LogEntry[], total: number }>(`${ADMIN_PREFIX}/logs${qs !== '' ? `?${qs}` : ''}`);
}

// ── Kafka status (S5-900 — to be implemented) ──────────────────────────────

export function getKafkaStatus(): Promise<KafkaStatus> {
  return apiClient.get<KafkaStatus>(`${ADMIN_PREFIX}/system/kafka`);
}
