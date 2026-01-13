// apps/web/src/lib/api-client.ts

import axios from 'axios';
import type { AxiosInstance, InternalAxiosRequestConfig } from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

class ApiClient {
  private client: AxiosInstance;
  private token: string | null = null;
  private tenantSlug: string | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: API_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor to add auth token and tenant slug
    this.client.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        if (this.token) {
          config.headers.Authorization = `Bearer ${this.token}`;
        }
        if (this.tenantSlug) {
          config.headers['X-Tenant-Slug'] = this.tenantSlug;
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

  setTenantSlug(slug: string) {
    this.tenantSlug = slug;
  }

  clearAuth() {
    this.token = null;
    this.tenantSlug = null;
  }

  // Auth endpoints
  async login(email: string, password: string) {
    const response = await this.client.post('/api/auth/login', { email, password });
    return response.data;
  }

  async logout() {
    const response = await this.client.post('/api/auth/logout');
    return response.data;
  }

  async getCurrentUser() {
    const response = await this.client.get('/api/auth/me');
    return response.data;
  }

  async refreshToken() {
    const response = await this.client.post('/api/auth/refresh');
    return response.data;
  }

  // Tenant endpoints
  async getTenants(params?: { page?: number; limit?: number; search?: string }) {
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

  async updateTenant(id: string, data: Partial<{ name: string; slug: string }>) {
    const response = await this.client.patch(`/api/tenants/${id}`, data);
    return response.data;
  }

  async deleteTenant(id: string) {
    const response = await this.client.delete(`/api/tenants/${id}`);
    return response.data;
  }

  // Plugin endpoints
  async getPlugins(params?: { category?: string; status?: string; search?: string }) {
    const response = await this.client.get('/api/plugins', { params });
    return response.data;
  }

  async getPlugin(pluginId: string) {
    const response = await this.client.get(`/api/plugins/${pluginId}`);
    return response.data;
  }

  async getTenantPlugins(tenantId: string) {
    const response = await this.client.get(`/api/tenants/${tenantId}/plugins`);
    return response.data;
  }

  async installPlugin(tenantId: string, pluginId: string, configuration: Record<string, any>) {
    const response = await this.client.post(
      `/api/tenants/${tenantId}/plugins/${pluginId}/install`,
      { configuration }
    );
    return response.data;
  }

  async activatePlugin(tenantId: string, pluginId: string) {
    const response = await this.client.post(
      `/api/tenants/${tenantId}/plugins/${pluginId}/activate`
    );
    return response.data;
  }

  async deactivatePlugin(tenantId: string, pluginId: string) {
    const response = await this.client.post(
      `/api/tenants/${tenantId}/plugins/${pluginId}/deactivate`
    );
    return response.data;
  }

  async uninstallPlugin(tenantId: string, pluginId: string) {
    const response = await this.client.delete(`/api/tenants/${tenantId}/plugins/${pluginId}`);
    return response.data;
  }

  // Health check
  async healthCheck() {
    const response = await this.client.get('/health');
    return response.data;
  }
}

export const apiClient = new ApiClient();
export default apiClient;
