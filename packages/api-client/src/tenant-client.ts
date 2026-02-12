// File: packages/api-client/src/tenant-client.ts

/**
 * Tenant-scoped API client.
 *
 * Auto-injects X-Tenant-Slug and X-Workspace-ID headers on every request.
 * Provides typed methods for all tenant-level API endpoints.
 */

import type { InternalAxiosRequestConfig } from 'axios';
import { HttpClient } from './client.js';
import type { TenantClientConfig } from './types.js';
import type {
  Tenant,
  Workspace,
  WorkspaceMember,
  Team,
  CreateWorkspaceInput,
  UpdateWorkspaceInput,
  AddMemberInput,
  UpdateMemberRoleInput,
  TenantPlugin,
  PluginEntity,
  TenantUser,
} from '@plexica/types';

export class TenantApiClient extends HttpClient {
  private tenantSlug: string | null;
  private workspaceId: string | null;

  constructor(config: TenantClientConfig) {
    super(config);
    this.tenantSlug = config.tenantSlug ?? null;
    this.workspaceId = config.workspaceId ?? null;

    // Add request interceptor to inject tenant/workspace headers
    this.axios.interceptors.request.use(
      (reqConfig: InternalAxiosRequestConfig) => {
        if (this.tenantSlug) {
          reqConfig.headers['X-Tenant-Slug'] = this.tenantSlug;
        }
        if (this.workspaceId) {
          reqConfig.headers['X-Workspace-ID'] = this.workspaceId;
        }
        return reqConfig;
      },
      (error) => Promise.reject(error)
    );
  }

  // ---------------------------------------------------------------------------
  // Tenant/workspace context setters
  // ---------------------------------------------------------------------------

  setTenantSlug(slug: string): void {
    this.tenantSlug = slug;
  }

  getTenantSlug(): string | null {
    return this.tenantSlug;
  }

  setWorkspaceId(workspaceId: string | null): void {
    this.workspaceId = workspaceId;
  }

  getWorkspaceId(): string | null {
    return this.workspaceId;
  }

  clearContext(): void {
    this.tenantSlug = null;
    this.workspaceId = null;
    this.clearAuthProvider();
  }

  // ---------------------------------------------------------------------------
  // Auth endpoints
  // ---------------------------------------------------------------------------

  async login(email: string, password: string) {
    return this.post<{ token: string; user: TenantUser }>('/api/auth/login', { email, password });
  }

  async logout() {
    return this.post<{ message: string }>('/api/auth/logout');
  }

  async getCurrentUser() {
    return this.get<TenantUser>('/api/auth/me');
  }

  async refreshAuthToken() {
    return this.post<{ token: string }>('/api/auth/refresh');
  }

  // ---------------------------------------------------------------------------
  // Tenant endpoints
  // ---------------------------------------------------------------------------

  async getTenants(params?: { page?: number; limit?: number; search?: string }) {
    return this.get<Tenant[]>('/api/tenants', params);
  }

  async getTenant(id: string) {
    return this.get<Tenant>(`/api/tenants/${id}`);
  }

  async getTenantBySlug(slug: string) {
    return this.get<Tenant>(`/api/tenants/slug/${slug}`);
  }

  async createTenant(data: { name: string; slug: string }) {
    return this.post<Tenant>('/api/tenants', data);
  }

  async updateTenant(id: string, data: Partial<{ name: string; slug: string }>) {
    return this.patch<Tenant>(`/api/tenants/${id}`, data);
  }

  async deleteTenant(id: string) {
    return this.delete<{ message: string }>(`/api/tenants/${id}`);
  }

  // ---------------------------------------------------------------------------
  // Workspace endpoints
  // ---------------------------------------------------------------------------

  async getWorkspaces() {
    return this.get<Workspace[]>('/api/workspaces');
  }

  async getWorkspace(workspaceId: string) {
    return this.get<Workspace>(`/api/workspaces/${workspaceId}`);
  }

  async createWorkspace(data: CreateWorkspaceInput) {
    return this.post<Workspace>('/api/workspaces', data);
  }

  async updateWorkspace(workspaceId: string, data: UpdateWorkspaceInput) {
    return this.patch<Workspace>(`/api/workspaces/${workspaceId}`, data);
  }

  async deleteWorkspace(workspaceId: string) {
    return this.delete<{ message: string }>(`/api/workspaces/${workspaceId}`);
  }

  // --- Members ---

  async getWorkspaceMembers(workspaceId: string) {
    return this.get<WorkspaceMember[]>(`/api/workspaces/${workspaceId}/members`);
  }

  async addWorkspaceMember(workspaceId: string, data: AddMemberInput) {
    return this.post<WorkspaceMember>(`/api/workspaces/${workspaceId}/members`, data);
  }

  async updateWorkspaceMemberRole(
    workspaceId: string,
    userId: string,
    data: UpdateMemberRoleInput
  ) {
    return this.patch<WorkspaceMember>(`/api/workspaces/${workspaceId}/members/${userId}`, data);
  }

  async removeWorkspaceMember(workspaceId: string, userId: string) {
    return this.delete<{ message: string }>(`/api/workspaces/${workspaceId}/members/${userId}`);
  }

  // --- Teams ---

  async getWorkspaceTeams(workspaceId: string) {
    return this.get<Team[]>(`/api/workspaces/${workspaceId}/teams`);
  }

  async createTeam(data: { name: string; description?: string; workspaceId: string }) {
    return this.post<Team>(`/api/workspaces/${data.workspaceId}/teams`, {
      name: data.name,
      description: data.description,
    });
  }

  // ---------------------------------------------------------------------------
  // Plugin endpoints (tenant-scoped)
  // ---------------------------------------------------------------------------

  async getPlugins(params?: { category?: string; status?: string; search?: string }) {
    return this.get<PluginEntity[]>('/api/plugins', params);
  }

  async getPlugin(pluginId: string) {
    return this.get<PluginEntity>(`/api/plugins/${pluginId}`);
  }

  async getTenantPlugins(tenantId: string) {
    return this.get<TenantPlugin[]>(`/api/tenants/${tenantId}/plugins`);
  }

  async installPlugin(tenantId: string, pluginId: string, configuration: Record<string, unknown>) {
    return this.post<TenantPlugin>(`/api/tenants/${tenantId}/plugins/${pluginId}/install`, {
      configuration,
    });
  }

  async activatePlugin(tenantId: string, pluginId: string) {
    return this.post<TenantPlugin>(`/api/tenants/${tenantId}/plugins/${pluginId}/activate`);
  }

  async deactivatePlugin(tenantId: string, pluginId: string) {
    return this.post<TenantPlugin>(`/api/tenants/${tenantId}/plugins/${pluginId}/deactivate`);
  }

  async uninstallPlugin(tenantId: string, pluginId: string) {
    return this.delete<{ message: string }>(`/api/tenants/${tenantId}/plugins/${pluginId}`);
  }

  // ---------------------------------------------------------------------------
  // Health check
  // ---------------------------------------------------------------------------

  async healthCheck() {
    return this.get<{ status: string }>('/health');
  }
}
