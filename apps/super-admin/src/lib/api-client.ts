// apps/super-admin/src/lib/api-client.ts

import axios from 'axios';
import type { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { getToken, updateToken } from './keycloak';
import { getApiUrl } from './config';

/**
 * Super Admin API Client
 *
 * CRITICAL DIFFERENCES from tenant app:
 * - NO X-Tenant-Slug header (platform-wide access)
 * - NO X-Workspace-ID header (no workspace concept)
 * - Uses Keycloak token from plexica-admin realm
 * - All endpoints are admin-level
 */

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: getApiUrl(),
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor to add Keycloak auth token
    // CRITICAL: NO tenant headers in super-admin
    this.client.interceptors.request.use(
      async (config: InternalAxiosRequestConfig) => {
        try {
          // Ensure token is valid before making request
          await updateToken(30); // Refresh if expires in less than 30 seconds
        } catch {
          console.warn('[API Client] Token update failed, using existing token');
        }

        const token = getToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }

        // CRITICAL: Ensure NO tenant headers are sent
        // This is platform-wide admin access
        delete config.headers['X-Tenant-Slug'];
        delete config.headers['X-Workspace-ID'];

        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          // Token expired or invalid - redirect to login
          console.error('[API Client] Unauthorized (401), redirecting to login');
          window.location.href = '/login';
        } else if (error.response?.status === 403) {
          // Forbidden - user doesn't have super-admin role
          console.error('[API Client] Forbidden (403), insufficient permissions');
          // You could show a toast notification here
        }
        return Promise.reject(error);
      }
    );
  }

  // ===== TENANT MANAGEMENT =====

  async getTenants(params?: { page?: number; limit?: number; search?: string; status?: string }) {
    const response = await this.client.get('/api/admin/tenants', { params });
    return response.data;
  }

  async getTenant(id: string) {
    const response = await this.client.get(`/api/admin/tenants/${id}`);
    return response.data;
  }

  async createTenant(data: { name: string; slug: string }) {
    const response = await this.client.post('/api/admin/tenants', data);
    return response.data;
  }

  async updateTenant(id: string, data: Partial<{ name: string; slug: string; status: string }>) {
    const response = await this.client.patch(`/api/admin/tenants/${id}`, data);
    return response.data;
  }

  async deleteTenant(id: string) {
    const response = await this.client.delete(`/api/admin/tenants/${id}`);
    return response.data;
  }

  async suspendTenant(id: string) {
    const response = await this.client.post(`/api/admin/tenants/${id}/suspend`);
    return response.data;
  }

  async activateTenant(id: string) {
    const response = await this.client.post(`/api/admin/tenants/${id}/activate`);
    return response.data;
  }

  // ===== PLUGIN MANAGEMENT (GLOBAL REGISTRY) =====

  async getPlugins(params?: { category?: string; status?: string; search?: string }) {
    const response = await this.client.get('/api/admin/plugins', { params });
    return response.data;
  }

  async getPlugin(pluginId: string) {
    const response = await this.client.get(`/api/admin/plugins/${pluginId}`);
    return response.data;
  }

  async createPlugin(data: {
    name: string;
    version: string;
    description: string;
    category: string;
    author: string;
  }) {
    const response = await this.client.post('/api/admin/plugins', data);
    return response.data;
  }

  async updatePlugin(
    pluginId: string,
    data: Partial<{
      name: string;
      version: string;
      description: string;
      status: string;
    }>
  ) {
    const response = await this.client.patch(`/api/admin/plugins/${pluginId}`, data);
    return response.data;
  }

  async deletePlugin(pluginId: string) {
    const response = await this.client.delete(`/api/admin/plugins/${pluginId}`);
    return response.data;
  }

  async getPluginInstalls(pluginId: string) {
    const response = await this.client.get(`/api/admin/plugins/${pluginId}/installs`);
    return response.data;
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
    const response = await this.client.get('/api/marketplace/plugins', { params });
    return response.data;
  }

  async getMarketplacePlugin(pluginId: string, includeAllVersions = false) {
    const response = await this.client.get(`/api/marketplace/plugins/${pluginId}`, {
      params: { includeAllVersions },
    });
    return response.data;
  }

  async getMarketplaceStats() {
    const response = await this.client.get('/api/marketplace/stats');
    return response.data;
  }

  async reviewPlugin(pluginId: string, data: { action: 'approve' | 'reject'; reason?: string }) {
    const response = await this.client.post(`/api/marketplace/plugins/${pluginId}/review`, data);
    return response.data;
  }

  async deprecatePlugin(pluginId: string) {
    const response = await this.client.post(`/api/marketplace/plugins/${pluginId}/deprecate`);
    return response.data;
  }

  async getPluginAnalytics(pluginId: string, timeRange: '7d' | '30d' | '90d' | 'all' = '30d') {
    const response = await this.client.get(`/api/marketplace/plugins/${pluginId}/analytics`, {
      params: { timeRange },
    });
    return response.data;
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
    const response = await this.client.post('/api/marketplace/publish', data);
    return response.data;
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
    const response = await this.client.post(`/api/marketplace/plugins/${pluginId}/versions`, data);
    return response.data;
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
    const response = await this.client.patch(`/api/marketplace/plugins/${pluginId}`, data);
    return response.data;
  }

  async getPluginRatings(
    pluginId: string,
    params?: {
      page?: number;
      limit?: number;
      minRating?: number;
    }
  ) {
    const response = await this.client.get(`/api/marketplace/plugins/${pluginId}/ratings`, {
      params,
    });
    return response.data;
  }

  // ===== USER MANAGEMENT (CROSS-TENANT) =====

  async getUsers(params?: { tenantId?: string; search?: string; role?: string }) {
    const response = await this.client.get('/api/admin/users', { params });
    return response.data;
  }

  async getUser(userId: string) {
    const response = await this.client.get(`/api/admin/users/${userId}`);
    return response.data;
  }

  // ===== ANALYTICS =====

  async getAnalyticsOverview() {
    const response = await this.client.get('/api/admin/analytics/overview');
    return response.data;
  }

  async getAnalyticsTenants(params?: { period?: string }) {
    const response = await this.client.get('/api/admin/analytics/tenants', { params });
    return response.data;
  }

  async getAnalyticsPlugins(params?: { period?: string }) {
    const response = await this.client.get('/api/admin/analytics/plugins', { params });
    return response.data;
  }

  async getAnalyticsApiCalls(params?: { hours?: number }) {
    const response = await this.client.get('/api/admin/analytics/api-calls', { params });
    return response.data;
  }

  // ===== HEALTH CHECK =====

  async healthCheck() {
    const response = await this.client.get('/health');
    return response.data;
  }
}

export const apiClient = new ApiClient();
export default apiClient;
