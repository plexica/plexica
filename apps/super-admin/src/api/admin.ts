// File: apps/super-admin/src/api/admin.ts
//
// Typed API client functions for Spec 008 Super Admin backend endpoints.
// All functions use the existing `apiClient` singleton (SuperAdminApiClient)
// which handles Keycloak token refresh and auth failure redirects.
//
// Route prefixes (from index.ts):
//   adminRoutes      registered at /api   → endpoints: /api/admin/*
//   tenantAdminRoutes not used here (web app)
//
// Spec 008 NEW endpoints (added by T008-09–T008-11):
//   GET  /api/admin/super-admins
//   POST /api/admin/super-admins
//   DELETE /api/admin/super-admins/:id
//   GET  /api/admin/system/health
//   GET  /api/admin/system/config
//   PATCH /api/admin/system/config/:key
//   GET  /api/admin/audit-logs
//   GET  /api/admin/audit-logs/export   (T008-66)
//   POST /api/admin/tenants/:id/reactivate  (T008-64)

import { apiClient } from '@/lib/api-client';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: PaginationMeta;
}

// ---------------------------------------------------------------------------
// Super Admin types
// ---------------------------------------------------------------------------

export interface SuperAdmin {
  id: string;
  email: string;
  name: string;
  grantedAt: string;
  grantedBy: string;
}

export interface CreateSuperAdminDto {
  userId: string;
}

// ---------------------------------------------------------------------------
// System Health types
// ---------------------------------------------------------------------------

export interface DependencyHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyMs?: number;
  message?: string;
}

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  dependencies: {
    database: DependencyHealth;
    redis: DependencyHealth;
    keycloak: DependencyHealth;
    storage: DependencyHealth;
  };
}

// ---------------------------------------------------------------------------
// System Config types
// ---------------------------------------------------------------------------

export interface SystemConfigEntry {
  key: string;
  value: unknown;
  category: string;
  description?: string;
  updatedBy?: string;
  updatedAt: string;
}

export interface UpdateSystemConfigDto {
  value: unknown;
}

// ---------------------------------------------------------------------------
// Super Admin Dashboard types
// ---------------------------------------------------------------------------

export interface SuperAdminDashboard {
  totalTenants: number;
  activeTenants: number;
  suspendedTenants: number;
  totalUsers: number;
  activePlugins: number;
  apiCalls24h: number;
  systemHealth: SystemHealth;
}

// ---------------------------------------------------------------------------
// Audit Log types
// ---------------------------------------------------------------------------

export interface AuditLogEntry {
  id: string;
  tenantId?: string;
  userId?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  details: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
}

export interface AuditLogFilters {
  tenantId?: string;
  userId?: string;
  action?: string;
  resourceType?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export interface AuditLogPage {
  data: AuditLogEntry[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ---------------------------------------------------------------------------
// Super Admin API functions
// ---------------------------------------------------------------------------

/** GET /api/admin/super-admins — list all super admins */
export async function getSuperAdmins(): Promise<SuperAdmin[]> {
  return (apiClient as unknown as { get: (url: string) => Promise<SuperAdmin[]> }).get(
    '/api/admin/super-admins'
  );
}

/** POST /api/admin/super-admins — grant super admin role */
export async function createSuperAdmin(dto: CreateSuperAdminDto): Promise<SuperAdmin> {
  return (
    apiClient as unknown as { post: (url: string, data: unknown) => Promise<SuperAdmin> }
  ).post('/api/admin/super-admins', dto);
}

/** DELETE /api/admin/super-admins/:id — revoke super admin role */
export async function deleteSuperAdmin(id: string): Promise<{ message: string }> {
  return (
    apiClient as unknown as {
      delete: (url: string) => Promise<{ message: string }>;
    }
  ).delete(`/api/admin/super-admins/${id}`);
}

/** GET /api/admin/system/health — get full system health */
export async function getSystemHealth(): Promise<SystemHealth> {
  return (apiClient as unknown as { get: (url: string) => Promise<SystemHealth> }).get(
    '/api/admin/system/health'
  );
}

/** GET /api/admin/system/config — list all config entries, optionally filtered by category */
export async function getSystemConfig(category?: string): Promise<SystemConfigEntry[]> {
  const url = category
    ? `/api/admin/system/config?category=${encodeURIComponent(category)}`
    : '/api/admin/system/config';
  return (apiClient as unknown as { get: (url: string) => Promise<SystemConfigEntry[]> }).get(url);
}

/** PATCH /api/admin/system/config/:key — update a single config value */
export async function updateSystemConfig(
  key: string,
  dto: UpdateSystemConfigDto
): Promise<SystemConfigEntry> {
  return (
    apiClient as unknown as {
      patch: (url: string, data: unknown) => Promise<SystemConfigEntry>;
    }
  ).patch(`/api/admin/system/config/${encodeURIComponent(key)}`, dto);
}

/** GET /api/admin/audit-logs — paginated global audit log (super admin only) */
export async function getAdminAuditLogs(filters?: AuditLogFilters): Promise<AuditLogPage> {
  const params = new URLSearchParams();
  if (filters?.tenantId) params.set('tenantId', filters.tenantId);
  if (filters?.userId) params.set('userId', filters.userId);
  if (filters?.action) params.set('action', filters.action);
  if (filters?.resourceType) params.set('resourceType', filters.resourceType);
  if (filters?.startDate) params.set('startDate', filters.startDate);
  if (filters?.endDate) params.set('endDate', filters.endDate);
  if (filters?.page != null) params.set('page', String(filters.page));
  if (filters?.limit != null) params.set('limit', String(filters.limit));
  const qs = params.toString();
  const url = qs ? `/api/admin/audit-logs?${qs}` : '/api/admin/audit-logs';
  return (apiClient as unknown as { get: (url: string) => Promise<AuditLogPage> }).get(url);
}

/** GET /api/admin/dashboard — super admin platform dashboard */
export async function getSuperAdminDashboard(): Promise<SuperAdminDashboard> {
  return (apiClient as unknown as { get: (url: string) => Promise<SuperAdminDashboard> }).get(
    '/api/admin/dashboard'
  );
}

/** GET /api/admin/audit-logs/export — export audit log as CSV (T008-66) */
export async function exportAdminAuditLogs(
  filters?: Omit<AuditLogFilters, 'page' | 'limit'> & { format?: 'csv' | 'json' }
): Promise<Blob> {
  const params = new URLSearchParams();
  if (filters?.tenantId) params.set('tenantId', filters.tenantId);
  if (filters?.userId) params.set('userId', filters.userId);
  if (filters?.action) params.set('action', filters.action);
  if (filters?.resourceType) params.set('resourceType', filters.resourceType);
  if (filters?.startDate) params.set('startDate', filters.startDate);
  if (filters?.endDate) params.set('endDate', filters.endDate);
  if (filters?.format) params.set('format', filters.format);
  const qs = params.toString();
  const url = qs ? `/api/admin/audit-logs/export?${qs}` : '/api/admin/audit-logs/export';

  // Use native fetch for Blob response (axios doesn't handle Blob well in super-admin)
  const token = (apiClient as unknown as { getToken?: () => string | null }).getToken?.() ?? null;
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
  const response = await fetch(`${baseUrl}${url}`, { headers });
  if (!response.ok) {
    throw new Error(`Export failed: ${response.status} ${response.statusText}`);
  }
  return response.blob();
}

// ---------------------------------------------------------------------------
// Re-export existing AdminApiClient methods via apiClient for convenience
// (getTenants, getTenant, createTenant, etc. are already on apiClient)
// ---------------------------------------------------------------------------

export { apiClient };
