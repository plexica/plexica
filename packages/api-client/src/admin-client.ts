// File: packages/api-client/src/admin-client.ts

/**
 * Super-admin API client.
 *
 * NO tenant/workspace headers — all endpoints are platform-wide admin-level.
 * Provides typed methods for all admin API endpoints.
 */

import type { InternalAxiosRequestConfig } from 'axios';
import { HttpClient } from './client.js';
import type { AdminClientConfig, PaginatedResponse } from './types.js';
import { PaginatedPluginEntitySchema, PluginStatsSchema } from './schemas.js';
import type {
  Tenant,
  TenantDetail,
  AdminUser,
  PluginEntity,
  PluginDetail,
  PluginLifecycleStatus,
  PluginRating,
  AnalyticsOverview,
  TenantGrowthDataPoint,
  PluginUsageData,
  ApiCallMetrics,
} from '@plexica/types';

export class AdminApiClient extends HttpClient {
  constructor(config: AdminClientConfig) {
    super(config);

    // Ensure tenant headers are NEVER sent from admin client
    this.axios.interceptors.request.use(
      (reqConfig: InternalAxiosRequestConfig) => {
        delete reqConfig.headers['X-Tenant-Slug'];
        delete reqConfig.headers['X-Workspace-ID'];
        return reqConfig;
      },
      (error) => Promise.reject(error)
    );
  }

  // ===== TENANT MANAGEMENT =====

  async getTenants(params?: { page?: number; limit?: number; search?: string; status?: string }) {
    return this.get<PaginatedResponse<Tenant>>('/api/admin/tenants', params);
  }

  async getTenant(id: string) {
    return this.get<TenantDetail>(`/api/admin/tenants/${id}`);
  }

  async createTenant(data: {
    name: string;
    slug: string;
    adminEmail: string;
    pluginIds?: string[];
  }) {
    return this.post<Tenant>('/api/admin/tenants', data);
  }

  async updateTenant(
    id: string,
    data: Partial<{
      name: string;
      settings: Record<string, unknown>;
      theme: Record<string, unknown>;
    }>
  ) {
    return this.patch<Tenant>(`/api/admin/tenants/${id}`, data);
  }

  async deleteTenant(id: string) {
    return this.delete<{ message: string }>(`/api/admin/tenants/${id}`);
  }

  async suspendTenant(id: string) {
    return this.post<Tenant>(`/api/admin/tenants/${id}/suspend`);
  }

  async activateTenant(id: string) {
    return this.post<Tenant>(`/api/admin/tenants/${id}/activate`);
  }

  async checkSlugAvailability(slug: string) {
    return this.get<{ slug: string; available: boolean }>('/api/admin/tenants/check-slug', {
      slug,
    });
  }

  async resendInvite(id: string) {
    return this.post<{ message: string; sentAt: string }>(`/api/admin/tenants/${id}/resend-invite`);
  }

  // ===== PLUGIN MANAGEMENT (GLOBAL REGISTRY) =====

  async getPlugins(params?: {
    category?: string;
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    return this.get<PaginatedResponse<PluginEntity>>('/api/admin/plugins', params);
  }

  /**
   * Fetch plugins from the v1 lifecycle registry endpoint (T004-09).
   * Returns all plugins with `lifecycleStatus` (ADR-018) in addition to `status`.
   * Response is validated at runtime via Zod to surface shape mismatches early (MEDIUM #8).
   */
  async getRegistryPlugins(params?: {
    lifecycleStatus?: PluginLifecycleStatus;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResponse<PluginEntity>> {
    const raw = await this.get<unknown>('/api/v1/plugins', params);
    return PaginatedPluginEntitySchema.parse(raw) as PaginatedResponse<PluginEntity>;
  }

  /**
   * Fetch per-lifecycle-status counts for the Registry stat summary bar (T004-28 fix).
   * Server-side aggregation: avoids fetching hundreds of full entities just for counts.
   * Response is validated at runtime via Zod (MEDIUM #8).
   *
   * Returns: { total: number, REGISTERED?: number, INSTALLED?: number, ACTIVE?: number, ... }
   */
  async getRegistryPluginStats(): Promise<Record<string, number>> {
    const raw = await this.get<unknown>('/api/v1/plugins/stats');
    return PluginStatsSchema.parse(raw);
  }

  /**
   * Trigger installation of a plugin (moves lifecycle: REGISTERED → INSTALLING → INSTALLED).
   */
  async installPlugin(pluginId: string) {
    return this.post<PluginEntity>(`/api/v1/plugins/${pluginId}/install`);
  }

  /**
   * Cancel an in-progress installation (INSTALLING → REGISTERED).
   */
  async cancelInstall(pluginId: string) {
    return this.delete<{ message: string }>(`/api/v1/plugins/${pluginId}/install`);
  }

  /**
   * Fetch a single plugin by id from the v1 registry (T004-29 polling).
   */
  async getRegistryPlugin(pluginId: string) {
    return this.get<PluginEntity>(`/api/v1/plugins/${pluginId}`);
  }

  /**
   * Enable a plugin across the platform (INSTALLED → ACTIVE).
   */
  async enablePlugin(pluginId: string) {
    return this.post<PluginEntity>(`/api/v1/plugins/${pluginId}/enable`);
  }

  /**
   * Disable a plugin (ACTIVE → DISABLED).
   */
  async disablePlugin(pluginId: string) {
    return this.post<PluginEntity>(`/api/v1/plugins/${pluginId}/disable`);
  }

  /**
   * Update a plugin to a new version (ACTIVE/INSTALLED → INSTALLING → INSTALLED/ACTIVE).
   * @param targetVersion - The version to update to (optional; defaults to latest).
   */
  async upgradePlugin(pluginId: string, targetVersion?: string) {
    return this.post<PluginEntity>(`/api/v1/plugins/${pluginId}/update`, {
      ...(targetVersion ? { targetVersion } : {}),
    });
  }

  /**
   * Uninstall a plugin (any → UNINSTALLING → UNINSTALLED).
   * @param deleteData - If true, all tenant schema data for this plugin is purged.
   */
  async uninstallPlugin(pluginId: string, deleteData = false) {
    return this.post<{ message: string }>(`/api/v1/plugins/${pluginId}/uninstall`, { deleteData });
  }

  async getPlugin(pluginId: string) {
    return this.get<PluginDetail>(`/api/admin/plugins/${pluginId}`);
  }

  async createPlugin(data: {
    name: string;
    version: string;
    description: string;
    category: string;
    author: string;
  }) {
    return this.post<PluginEntity>('/api/admin/plugins', data);
  }

  async updatePlugin(
    pluginId: string,
    data: Partial<{ name: string; version: string; description: string; status: string }>
  ) {
    return this.patch<PluginEntity>(`/api/admin/plugins/${pluginId}`, data);
  }

  async deletePlugin(pluginId: string) {
    return this.delete<{ message: string }>(`/api/admin/plugins/${pluginId}`);
  }

  async getPluginInstalls(pluginId: string) {
    return this.get<{ tenantId: string; installedAt: string }[]>(
      `/api/admin/plugins/${pluginId}/installs`
    );
  }

  // ===== MARKETPLACE MANAGEMENT =====

  async searchMarketplace(params?: {
    query?: string;
    category?: string;
    status?: string;
    sortBy?: string;
    sortOrder?: string;
    page?: number;
    limit?: number;
  }) {
    return this.get<PaginatedResponse<PluginEntity>>('/api/marketplace/plugins', params);
  }

  async getMarketplacePlugin(pluginId: string, includeAllVersions = false) {
    return this.get<PluginDetail>(`/api/marketplace/plugins/${pluginId}`, {
      includeAllVersions,
    });
  }

  async getMarketplaceStats() {
    return this.get<{
      totalPlugins: number;
      publishedPlugins: number;
      totalDownloads: number;
      totalRatings: number;
    }>('/api/marketplace/stats');
  }

  async reviewPlugin(pluginId: string, data: { action: 'approve' | 'reject'; reason?: string }) {
    return this.post<PluginEntity>(`/api/marketplace/plugins/${pluginId}/review`, data);
  }

  async deprecatePlugin(pluginId: string) {
    return this.post<PluginEntity>(`/api/marketplace/plugins/${pluginId}/deprecate`);
  }

  async getPluginAnalytics(pluginId: string, timeRange: '7d' | '30d' | '90d' | 'all' = '30d') {
    return this.get<{
      downloads: number;
      installs: number;
      ratings: number;
      averageRating: number;
    }>(`/api/marketplace/plugins/${pluginId}/analytics`, { timeRange });
  }

  async publishPlugin(data: {
    id: string;
    name: string;
    version: string;
    description: string;
    longDescription?: string;
    category: string;
    author: string;
    authorEmail: string;
    manifest: Record<string, unknown>;
    homepage?: string;
    repository?: string;
    license: string;
    icon?: string;
    screenshots?: string[];
    demoUrl?: string;
    tags?: string[];
  }) {
    return this.post<PluginEntity>('/api/marketplace/publish', data);
  }

  async publishVersion(
    pluginId: string,
    data: {
      version: string;
      changelog: string;
      manifest: Record<string, unknown>;
      setAsLatest?: boolean;
    }
  ) {
    return this.post<PluginEntity>(`/api/marketplace/plugins/${pluginId}/versions`, data);
  }

  async updatePluginMetadata(
    pluginId: string,
    data: {
      description?: string;
      longDescription?: string;
      tags?: string[];
      homepage?: string;
      repository?: string;
      screenshots?: string[];
      demoUrl?: string;
    }
  ) {
    return this.patch<PluginEntity>(`/api/marketplace/plugins/${pluginId}`, data);
  }

  async getPluginRatings(
    pluginId: string,
    params?: { page?: number; limit?: number; minRating?: number }
  ) {
    return this.get<PaginatedResponse<PluginRating>>(
      `/api/marketplace/plugins/${pluginId}/ratings`,
      params
    );
  }

  // ===== USER MANAGEMENT (CROSS-TENANT) =====

  async getUsers(params?: { tenantId?: string; search?: string; role?: string }) {
    return this.get<PaginatedResponse<AdminUser>>('/api/admin/users', params);
  }

  async getUser(userId: string) {
    return this.get<AdminUser>(`/api/admin/users/${userId}`);
  }

  // ===== ANALYTICS =====

  async getAnalyticsOverview() {
    return this.get<AnalyticsOverview>('/api/admin/analytics/overview');
  }

  async getAnalyticsTenants(params?: { period?: string }) {
    return this.get<TenantGrowthDataPoint[]>('/api/admin/analytics/tenants', params);
  }

  async getAnalyticsPlugins(params?: { period?: string }) {
    return this.get<PluginUsageData[]>('/api/admin/analytics/plugins', params);
  }

  async getAnalyticsApiCalls(params?: { hours?: number }) {
    return this.get<ApiCallMetrics[]>('/api/admin/analytics/api-calls', params);
  }

  // ===== HEALTH CHECK =====

  async healthCheck() {
    return this.get<{ status: string }>('/health');
  }
}
