// admin-api.ts
// Typed Admin API methods. All calls target /api/v1/admin/* endpoints.
// Stubs return empty/placeholder shapes — filled per feature in subsequent
// sprint cards. Every method goes through apiClient for auth + 401 handling.

import { apiClient } from './api-client.js';

import type {
  DashboardMetrics,
  HealthStatus,
  KafkaStatus,
  LogEntry,
  Plugin,
  ProvisionRequest,
  TenantDetail,
  TenantSummary,
} from '../types/admin-types.js';

const ADMIN_PREFIX = '/api/v1/admin';

// ── Dashboard ───────────────────────────────────────────────────────────────

export function getDashboardMetrics(): Promise<DashboardMetrics> {
  return apiClient.get<DashboardMetrics>(`${ADMIN_PREFIX}/dashboard/metrics`);
}

// ── Tenants ─────────────────────────────────────────────────────────────────

export function listTenants(): Promise<TenantSummary[]> {
  return apiClient.get<TenantSummary[]>(`${ADMIN_PREFIX}/tenants`);
}

export function getTenant(id: string): Promise<TenantDetail> {
  return apiClient.get<TenantDetail>(`${ADMIN_PREFIX}/tenants/${id}`);
}

export function provisionTenant(req: ProvisionRequest): Promise<TenantDetail> {
  return apiClient.post<TenantDetail>(`${ADMIN_PREFIX}/tenants`, req);
}

export function suspendTenant(id: string): Promise<void> {
  return apiClient.post<void>(`${ADMIN_PREFIX}/tenants/${id}/suspend`);
}

export function activateTenant(id: string): Promise<void> {
  return apiClient.post<void>(`${ADMIN_PREFIX}/tenants/${id}/activate`);
}

export function deprovisionTenant(id: string): Promise<void> {
  return apiClient.delete<void>(`${ADMIN_PREFIX}/tenants/${id}`);
}

// ── Plugins ─────────────────────────────────────────────────────────────────

export function listPlugins(): Promise<Plugin[]> {
  return apiClient.get<Plugin[]>(`${ADMIN_PREFIX}/plugins`);
}

export function publishPlugin(id: string): Promise<Plugin> {
  return apiClient.post<Plugin>(`${ADMIN_PREFIX}/plugins/${id}/publish`);
}

export function deprecatePlugin(id: string): Promise<Plugin> {
  return apiClient.post<Plugin>(`${ADMIN_PREFIX}/plugins/${id}/deprecate`);
}

// ── Health ──────────────────────────────────────────────────────────────────

export function getHealth(): Promise<HealthStatus> {
  return apiClient.get<HealthStatus>(`${ADMIN_PREFIX}/health`);
}

// ── Logs ────────────────────────────────────────────────────────────────────

export function getLogs(limit = 100): Promise<LogEntry[]> {
  return apiClient.get<LogEntry[]>(`${ADMIN_PREFIX}/logs?limit=${limit}`);
}

// ── Kafka ───────────────────────────────────────────────────────────────────

export function getKafkaStatus(): Promise<KafkaStatus> {
  return apiClient.get<KafkaStatus>(`${ADMIN_PREFIX}/kafka/status`);
}

export function replayDlqMessages(topic: string, count: number): Promise<void> {
  return apiClient.post<void>(`${ADMIN_PREFIX}/kafka/dlq/replay`, { topic, count });
}
