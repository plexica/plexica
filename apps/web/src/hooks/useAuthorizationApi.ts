// apps/web/src/hooks/useAuthorizationApi.ts
//
// Phase 3a — Raw fetch wrappers for all Spec 003 authorization endpoints.
// All endpoints under /api/v1 using apiClient from @/lib/api-client.
//
// Spec 003: Authorization System RBAC + ABAC

import { apiClient } from '@/lib/api-client';

// ---------------------------------------------------------------------------
// Internal raw client helper — exposes post/put/delete at runtime
// ---------------------------------------------------------------------------

type RawAuthzClient = {
  get: <T>(url: string) => Promise<T>;
  patch: <T>(url: string, body: unknown) => Promise<T>;
  post: <T>(url: string, body?: unknown) => Promise<T>;
  put: <T>(url: string, body?: unknown) => Promise<T>;
  delete: <T>(url: string) => Promise<T>;
};

function raw(): RawAuthzClient {
  return apiClient as unknown as RawAuthzClient;
}

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export interface Permission {
  id: string;
  tenantId: string;
  key: string;
  name: string;
  description?: string;
  pluginId: string | null;
  createdAt: string;
}

export interface RoleWithPermissions {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  isSystem: boolean;
  permissions: Permission[];
  userCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface RolePage {
  data: RoleWithPermissions[];
  meta: {
    total: number;
    page: number;
    limit: number;
    customRoleCount: number;
  };
}

export type ConditionTree =
  | { all: ConditionTree[] }
  | { any: ConditionTree[] }
  | { not: ConditionTree }
  | { attribute: string; operator: string; value: unknown };

export interface Policy {
  id: string;
  tenantId: string;
  name: string;
  resource: string;
  effect: 'DENY' | 'FILTER';
  conditions: ConditionTree;
  priority: number;
  source: 'core' | 'plugin' | 'super_admin' | 'tenant_admin';
  pluginId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PolicyPage {
  data: Policy[];
  meta: {
    total: number;
    page: number;
    limit: number;
    featureEnabled?: boolean;
  };
}

export interface CreateRoleDto {
  name: string;
  description?: string;
  permissionIds: string[];
}

export interface UpdateRoleDto {
  name?: string;
  description?: string;
  permissionIds?: string[];
}

export interface CreatePolicyDto {
  name: string;
  resource: string;
  effect: 'DENY' | 'FILTER';
  priority?: number;
  conditions: ConditionTree;
}

export interface UpdatePolicyDto {
  name?: string;
  resource?: string;
  effect?: 'DENY' | 'FILTER';
  priority?: number;
  conditions?: ConditionTree;
  isActive?: boolean;
}

// ---------------------------------------------------------------------------
// 429 Rate Limit handling
// ---------------------------------------------------------------------------

interface RateLimitError extends Error {
  retryAfter: number;
}

/** Parse Retry-After header value (seconds or HTTP-date) → seconds as integer */
function parseRetryAfter(header: string | null): number {
  if (!header) return 60;
  const seconds = parseInt(header, 10);
  if (!isNaN(seconds)) return seconds;
  // HTTP-date fallback
  const retryDate = new Date(header).getTime();
  if (!isNaN(retryDate)) {
    return Math.max(1, Math.ceil((retryDate - Date.now()) / 1000));
  }
  return 60;
}

function makeRateLimitError(retryAfterHeader: string | null): RateLimitError {
  const retryAfter = parseRetryAfter(retryAfterHeader);
  const err = new Error(`Rate limited. Retry after ${retryAfter}s`) as RateLimitError;
  err.retryAfter = retryAfter;
  return err;
}

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export interface RoleFilters {
  page?: number;
  limit?: number;
  search?: string;
  isSystem?: boolean;
}

function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
  const q = new URLSearchParams();
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== null) {
      q.set(key, String(val));
    }
  }
  const qs = q.toString();
  return qs ? `?${qs}` : '';
}

/** GET /api/v1/roles?page=&limit=&search=&isSystem= */
export async function getRoles(filters?: RoleFilters): Promise<RolePage> {
  const qs = buildQuery({
    page: filters?.page,
    limit: filters?.limit,
    search: filters?.search,
    isSystem: filters?.isSystem,
  });
  return raw().get<RolePage>(`/api/v1/roles${qs}`);
}

/** POST /api/v1/roles */
export async function createRole(dto: CreateRoleDto): Promise<RoleWithPermissions> {
  return raw().post<RoleWithPermissions>('/api/v1/roles', dto);
}

/** PUT /api/v1/roles/:id */
export async function updateRole(id: string, dto: UpdateRoleDto): Promise<RoleWithPermissions> {
  return raw().put<RoleWithPermissions>(`/api/v1/roles/${id}`, dto);
}

/** DELETE /api/v1/roles/:id → 204 */
export async function deleteRole(id: string): Promise<void> {
  return raw().delete<void>(`/api/v1/roles/${id}`);
}

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

export interface PermissionListResponse {
  data: Permission[];
  groups: Record<string, Permission[]>;
}

/** GET /api/v1/permissions?page=&limit= */
export async function getPermissions(filters?: {
  page?: number;
  limit?: number;
}): Promise<PermissionListResponse> {
  const qs = buildQuery({ page: filters?.page, limit: filters?.limit });
  return raw().get<PermissionListResponse>(`/api/v1/permissions${qs}`);
}

// ---------------------------------------------------------------------------
// User role assignment
// ---------------------------------------------------------------------------

/** POST /api/v1/users/:id/roles */
export async function assignUserRole(userId: string, roleId: string): Promise<void> {
  return raw().post<void>(`/api/v1/users/${userId}/roles`, { roleId });
}

/** DELETE /api/v1/users/:id/roles/:roleId */
export async function removeUserRole(userId: string, roleId: string): Promise<void> {
  return raw().delete<void>(`/api/v1/users/${userId}/roles/${roleId}`);
}

// ---------------------------------------------------------------------------
// Current user (me)
// ---------------------------------------------------------------------------

/** GET /api/v1/me/roles */
export async function getMyRoles(): Promise<{ data: RoleWithPermissions[] }> {
  return raw().get<{ data: RoleWithPermissions[] }>('/api/v1/me/roles');
}

/** GET /api/v1/me/permissions */
export async function getMyPermissions(): Promise<{
  data: string[];
  wildcards: string[];
}> {
  return raw().get<{ data: string[]; wildcards: string[] }>('/api/v1/me/permissions');
}

// ---------------------------------------------------------------------------
// Policies
// ---------------------------------------------------------------------------

export interface PolicyFilters {
  page?: number;
  limit?: number;
  resource?: string;
  effect?: 'DENY' | 'FILTER';
  isActive?: boolean;
}

/** GET /api/v1/policies?page=&limit=&resource=&effect=&isActive= */
export async function getPolicies(filters?: PolicyFilters): Promise<PolicyPage> {
  const qs = buildQuery({
    page: filters?.page,
    limit: filters?.limit,
    resource: filters?.resource,
    effect: filters?.effect,
    isActive: filters?.isActive,
  });
  return raw().get<PolicyPage>(`/api/v1/policies${qs}`);
}

/** POST /api/v1/policies */
export async function createPolicy(dto: CreatePolicyDto): Promise<Policy> {
  return raw().post<Policy>('/api/v1/policies', dto);
}

/** PUT /api/v1/policies/:id */
export async function updatePolicy(id: string, dto: UpdatePolicyDto): Promise<Policy> {
  return raw().put<Policy>(`/api/v1/policies/${id}`, dto);
}

/** DELETE /api/v1/policies/:id → 204 */
export async function deletePolicy(id: string): Promise<void> {
  return raw().delete<void>(`/api/v1/policies/${id}`);
}

// Re-export helpers for consumers that need them
export { makeRateLimitError, parseRetryAfter };
