// File: apps/web/src/api/admin.ts
//
// Typed API client functions for Spec 008 Tenant Admin backend endpoints.
// All functions use the existing `adminApiClient` singleton (WebAdminApiClient)
// which handles Keycloak token refresh and auth failure redirects.
//
// Route prefixes (from index.ts):
//   tenantAdminRoutes registered at /api/v1  → endpoints: /api/v1/tenant/*
//
// Spec 008 Tenant Admin endpoints:
//   GET  /api/v1/tenant/dashboard
//   GET  /api/v1/tenant/users
//   POST /api/v1/tenant/users/invite
//   PUT  /api/v1/tenant/users/:id
//   POST /api/v1/tenant/users/:id/deactivate
//   POST /api/v1/tenant/users/:id/reactivate
//   GET  /api/v1/tenant/teams
//   POST /api/v1/tenant/teams
//   PATCH /api/v1/tenant/teams/:teamId
//   DELETE /api/v1/tenant/teams/:teamId
//   POST /api/v1/tenant/teams/:teamId/members
//   DELETE /api/v1/tenant/teams/:teamId/members/:userId
//   GET  /api/v1/tenant/roles
//   POST /api/v1/tenant/roles
//   PATCH /api/v1/tenant/roles/:roleId
//   DELETE /api/v1/tenant/roles/:roleId
//   GET  /api/v1/tenant/permissions
//   GET  /api/v1/tenant/settings
//   PATCH /api/v1/tenant/settings
//   GET  /api/v1/tenant/audit-logs
//   POST /api/v1/tenant/audit-logs/export  (T008-66)

import { adminApiClient } from '@/lib/api-client';

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
// Tenant Admin Dashboard types
// ---------------------------------------------------------------------------

export interface TenantDashboard {
  totalUsers: number;
  activeUsers: number;
  pendingInvitations: number;
  totalTeams: number;
  activePlugins: number;
  storageUsedBytes: number;
  apiCalls24h: number;
}

// ---------------------------------------------------------------------------
// Tenant User types
// ---------------------------------------------------------------------------

/** Status values for a tenant user entry */
export type TenantUserStatus = 'active' | 'inactive' | 'invited' | 'expired' | 'cancelled';

/** Team role per ADR-024 (application-level, subordinate to Keycloak realm role) */
export type TeamMemberRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';

export interface TenantUser {
  id: string;
  email: string;
  name: string;
  status: TenantUserStatus;
  roles: string[];
  teams: string[];
  createdAt: string;
  lastLoginAt?: string;
}

export interface InviteUserDto {
  email: string;
  roleId?: string;
  teamIds?: string[];
}

export interface UpdateTenantUserDto {
  roleId?: string;
  teamIds?: string[];
}

// ---------------------------------------------------------------------------
// Team types
// ---------------------------------------------------------------------------

export interface TeamMember {
  userId: string;
  email: string;
  name: string;
  role: TeamMemberRole;
  joinedAt: string;
}

export interface Team {
  id: string;
  name: string;
  description?: string;
  workspaceId?: string;
  memberCount: number;
  members?: TeamMember[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateTeamDto {
  name: string;
  description?: string;
  workspaceId?: string;
}

export interface UpdateTeamDto {
  name?: string;
  description?: string;
}

export interface AddTeamMemberDto {
  userId: string;
  role: TeamMemberRole;
}

// ---------------------------------------------------------------------------
// Role & Permission types
// ---------------------------------------------------------------------------

export interface Permission {
  id: string;
  name: string;
  resource: string;
  action: string;
  description?: string;
  pluginId?: string;
}

export interface PermissionGroup {
  source: string;
  displayName: string;
  permissions: Permission[];
}

export interface TenantRole {
  id: string;
  name: string;
  description?: string;
  isSystem: boolean;
  permissions: string[];
  userCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRoleDto {
  name: string;
  description?: string;
  permissions: string[];
}

export interface UpdateRoleDto {
  name?: string;
  description?: string;
  permissions?: string[];
}

// ---------------------------------------------------------------------------
// Tenant Settings types
// ---------------------------------------------------------------------------

export interface TenantSettings {
  theme: {
    primaryColor?: string;
    accentColor?: string;
    logoUrl?: string;
    fontHeading?: string;
    fontBody?: string;
  };
  preferences: {
    defaultLocale?: string;
    timezone?: string;
    dateFormat?: string;
  };
  integrations: Record<string, unknown>;
}

export type UpdateTenantSettingsDto = Partial<TenantSettings>;

// ---------------------------------------------------------------------------
// Audit Log types (tenant-scoped)
// ---------------------------------------------------------------------------

export interface TenantAuditLogEntry {
  id: string;
  userId?: string;
  userEmail?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  details: Record<string, unknown>;
  ipAddress?: string;
  createdAt: string;
}

export interface TenantAuditLogFilters {
  userId?: string;
  action?: string;
  resourceType?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export interface TenantAuditLogPage {
  data: TenantAuditLogEntry[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ExportAuditLogDto {
  format: 'csv' | 'json';
  filters?: Omit<TenantAuditLogFilters, 'page' | 'limit'>;
}

// ---------------------------------------------------------------------------
// Helper: access protected HttpClient methods via type cast
// ---------------------------------------------------------------------------

type RawClient = {
  get: <T>(url: string, params?: Record<string, unknown>) => Promise<T>;
  post: <T>(url: string, data?: unknown) => Promise<T>;
  patch: <T>(url: string, data?: unknown) => Promise<T>;
  delete: <T>(url: string) => Promise<T>;
};

function raw(): RawClient {
  return adminApiClient as unknown as RawClient;
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

/** GET /api/v1/tenant/dashboard — tenant overview metrics */
export async function getTenantDashboard(): Promise<TenantDashboard> {
  return raw().get<TenantDashboard>('/api/v1/tenant/dashboard');
}

// ---------------------------------------------------------------------------
// User management
// ---------------------------------------------------------------------------

/** GET /api/v1/tenant/users — list users in the current tenant */
export async function getTenantUsers(params?: {
  search?: string;
  status?: TenantUserStatus;
  page?: number;
  limit?: number;
}): Promise<PaginatedResult<TenantUser>> {
  return raw().get<PaginatedResult<TenantUser>>(
    '/api/v1/tenant/users',
    params as Record<string, unknown>
  );
}

/** POST /api/v1/tenant/users/invite — invite a new user */
export async function inviteTenantUser(dto: InviteUserDto): Promise<TenantUser> {
  return raw().post<TenantUser>('/api/v1/tenant/users/invite', dto);
}

/** PUT /api/v1/tenant/users/:id — update user role/teams */
export async function updateTenantUser(id: string, dto: UpdateTenantUserDto): Promise<TenantUser> {
  return raw().patch<TenantUser>(`/api/v1/tenant/users/${id}`, dto);
}

/** POST /api/v1/tenant/users/:id/deactivate — deactivate a user */
export async function deactivateTenantUser(id: string): Promise<TenantUser> {
  return raw().post<TenantUser>(`/api/v1/tenant/users/${id}/deactivate`);
}

/** POST /api/v1/tenant/users/:id/reactivate — reactivate a user */
export async function reactivateTenantUser(id: string): Promise<TenantUser> {
  return raw().post<TenantUser>(`/api/v1/tenant/users/${id}/reactivate`);
}

// ---------------------------------------------------------------------------
// Team management
// ---------------------------------------------------------------------------

/** GET /api/v1/tenant/teams — list all teams */
export async function getTenantTeams(params?: {
  search?: string;
  page?: number;
  limit?: number;
}): Promise<PaginatedResult<Team>> {
  return raw().get<PaginatedResult<Team>>(
    '/api/v1/tenant/teams',
    params as Record<string, unknown>
  );
}

/** POST /api/v1/tenant/teams — create a new team */
export async function createTenantTeam(dto: CreateTeamDto): Promise<Team> {
  return raw().post<Team>('/api/v1/tenant/teams', dto);
}

/** PATCH /api/v1/tenant/teams/:teamId — update team name/description */
export async function updateTenantTeam(teamId: string, dto: UpdateTeamDto): Promise<Team> {
  return raw().patch<Team>(`/api/v1/tenant/teams/${teamId}`, dto);
}

/** DELETE /api/v1/tenant/teams/:teamId — delete a team */
export async function deleteTenantTeam(teamId: string): Promise<{ message: string }> {
  return raw().delete<{ message: string }>(`/api/v1/tenant/teams/${teamId}`);
}

/** POST /api/v1/tenant/teams/:teamId/members — add a member to a team */
export async function addTeamMember(teamId: string, dto: AddTeamMemberDto): Promise<TeamMember> {
  return raw().post<TeamMember>(`/api/v1/tenant/teams/${teamId}/members`, dto);
}

/** DELETE /api/v1/tenant/teams/:teamId/members/:userId — remove a member from a team */
export async function removeTeamMember(
  teamId: string,
  userId: string
): Promise<{ message: string }> {
  return raw().delete<{ message: string }>(`/api/v1/tenant/teams/${teamId}/members/${userId}`);
}

// ---------------------------------------------------------------------------
// Roles & Permissions
// ---------------------------------------------------------------------------

/** GET /api/v1/tenant/roles — list all roles */
export async function getTenantRoles(): Promise<TenantRole[]> {
  return raw().get<TenantRole[]>('/api/v1/tenant/roles');
}

/** POST /api/v1/tenant/roles — create a custom role */
export async function createTenantRole(dto: CreateRoleDto): Promise<TenantRole> {
  return raw().post<TenantRole>('/api/v1/tenant/roles', dto);
}

/** PATCH /api/v1/tenant/roles/:roleId — update a custom role */
export async function updateTenantRole(roleId: string, dto: UpdateRoleDto): Promise<TenantRole> {
  return raw().patch<TenantRole>(`/api/v1/tenant/roles/${roleId}`, dto);
}

/** DELETE /api/v1/tenant/roles/:roleId — delete a custom role */
export async function deleteTenantRole(roleId: string): Promise<{ message: string }> {
  return raw().delete<{ message: string }>(`/api/v1/tenant/roles/${roleId}`);
}

/** GET /api/v1/tenant/permissions — list all permissions grouped by plugin/source */
export async function getTenantPermissions(): Promise<PermissionGroup[]> {
  return raw().get<PermissionGroup[]>('/api/v1/tenant/permissions');
}

// ---------------------------------------------------------------------------
// Tenant Settings
// ---------------------------------------------------------------------------

/** GET /api/v1/tenant/settings — get current tenant settings */
export async function getTenantSettings(): Promise<TenantSettings> {
  return raw().get<TenantSettings>('/api/v1/tenant/settings');
}

/** PATCH /api/v1/tenant/settings — update tenant settings */
export async function updateTenantSettings(dto: UpdateTenantSettingsDto): Promise<TenantSettings> {
  return raw().patch<TenantSettings>('/api/v1/tenant/settings', dto);
}

// ---------------------------------------------------------------------------
// Tenant Audit Log
// ---------------------------------------------------------------------------

/** GET /api/v1/tenant/audit-logs — paginated tenant-scoped audit log */
export async function getTenantAuditLogs(
  filters?: TenantAuditLogFilters
): Promise<TenantAuditLogPage> {
  const params = new URLSearchParams();
  if (filters?.userId) params.set('userId', filters.userId);
  if (filters?.action) params.set('action', filters.action);
  if (filters?.resourceType) params.set('resourceType', filters.resourceType);
  if (filters?.startDate) params.set('startDate', filters.startDate);
  if (filters?.endDate) params.set('endDate', filters.endDate);
  if (filters?.page != null) params.set('page', String(filters.page));
  if (filters?.limit != null) params.set('limit', String(filters.limit));
  const qs = params.toString();
  const url = qs ? `/api/v1/tenant/audit-logs?${qs}` : '/api/v1/tenant/audit-logs';
  return raw().get<TenantAuditLogPage>(url);
}

/** POST /api/v1/tenant/audit-logs/export — request a bulk export (T008-66) */
export async function exportTenantAuditLogs(dto: ExportAuditLogDto): Promise<{ jobId: string }> {
  return raw().post<{ jobId: string }>('/api/v1/tenant/audit-logs/export', dto);
}
