// apps/super-admin/src/lib/api-client.ts

import axios from 'axios';
import type { AxiosInstance, InternalAxiosRequestConfig } from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

class ApiClient {
  private client: AxiosInstance;
  private token: string | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: API_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor to add auth token
    // NOTE: NO tenant header in super-admin (global view)
    this.client.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        if (this.token) {
          config.headers.Authorization = `Bearer ${this.token}`;
        }
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
          // Token expired or invalid
          this.clearAuth();
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }
    );
  }

  setToken(token: string) {
    this.token = token;
  }

  clearAuth() {
    this.token = null;
  }

  // ===== TENANT MANAGEMENT =====

  async getTenants(params?: { page?: number; limit?: number; search?: string; status?: string }) {
    const response = await this.client.get('/api/tenants', { params });
    return response.data;
  }

  async getTenant(id: string) {
    const response = await this.client.get(`/api/tenants/${id}`);
    return response.data;
  }

  async createTenant(data: { name: string; slug: string }) {
    const response = await this.client.post('/api/tenants', data);
    return response.data;
  }

  async updateTenant(id: string, data: Partial<{ name: string; slug: string; status: string }>) {
    const response = await this.client.patch(`/api/tenants/${id}`, data);
    return response.data;
  }

  async deleteTenant(id: string) {
    const response = await this.client.delete(`/api/tenants/${id}`);
    return response.data;
  }

  async suspendTenant(id: string) {
    const response = await this.client.post(`/api/tenants/${id}/suspend`);
    return response.data;
  }

  async activateTenant(id: string) {
    const response = await this.client.post(`/api/tenants/${id}/activate`);
    return response.data;
  }

  // ===== PLUGIN MANAGEMENT (GLOBAL REGISTRY) =====

  async getPlugins(params?: { category?: string; status?: string; search?: string }) {
    const response = await this.client.get('/api/plugins', { params });
    return response.data;
  }

  async getPlugin(pluginId: string) {
    const response = await this.client.get(`/api/plugins/${pluginId}`);
    return response.data;
  }

  async createPlugin(data: {
    name: string;
    version: string;
    description: string;
    category: string;
    author: string;
  }) {
    const response = await this.client.post('/api/plugins', data);
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
    const response = await this.client.patch(`/api/plugins/${pluginId}`, data);
    return response.data;
  }

  async deletePlugin(pluginId: string) {
    const response = await this.client.delete(`/api/plugins/${pluginId}`);
    return response.data;
  }

  async getPluginInstalls(pluginId: string) {
    const response = await this.client.get(`/api/plugins/${pluginId}/installs`);
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

  // ===== HEALTH CHECK =====

  async healthCheck() {
    const response = await this.client.get('/health');
    return response.data;
  }
}

export const apiClient = new ApiClient();
export default apiClient;
