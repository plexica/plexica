// plugin-api.ts — Typed API functions for plugin system domain (Spec 004).
// Used by TanStack Query hooks in use-plugins.ts.

import { apiClient } from './api-client.js';

import type {
  MarketplaceListResponse,
  PluginCatalogEntry,
  PluginInstallation,
  PluginRegisterPayload,
  PluginRegisterResponse,
  PluginVisibilityEntry,
  PluginVisibilityUpdate,
  DlqListResponse,
  InstallProgress,
  WorkspacePluginEntry,
} from '../types/plugin.js';

export const pluginApi = {
  // ── Marketplace (tenant) ─────────────────────────────────────────────────

  listPublished: (
    params?: { page?: number; search?: string; category?: string } | undefined
  ) => {
    const qs = new URLSearchParams();
    if (params?.page !== undefined) qs.set('page', String(params.page));
    if (params?.search !== undefined && params.search.length > 0) qs.set('search', params.search);
    if (params?.category !== undefined && params.category.length > 0) qs.set('category', params.category);
    const query = qs.toString();
    return apiClient.get<MarketplaceListResponse>(
      `/api/v1/plugins${query ? '?' + query : ''}`
    );
  },

  getPublished: (slug: string) =>
    apiClient.get<PluginCatalogEntry>(`/api/v1/plugins/${slug}`),

  install: (slug: string) =>
    apiClient.post<InstallProgress>(`/api/v1/plugins/${slug}/install`),

  // ── Installed plugins (tenant) ───────────────────────────────────────────

  listInstalled: () =>
    apiClient.get<PluginInstallation[]>('/api/v1/plugins/installed'),

  listWorkspacePlugins: (workspaceId: string) =>
    apiClient.get<WorkspacePluginEntry[]>(`/api/v1/plugins/workspace/${workspaceId}`),

  deactivate: (installId: string) =>
    apiClient.post<void>(`/api/v1/plugins/${installId}/deactivate`),

  reactivate: (installId: string) =>
    apiClient.post<void>(`/api/v1/plugins/${installId}/reactivate`),

  uninstall: (installId: string) =>
    apiClient.post<void>(`/api/v1/plugins/${installId}/uninstall`),

  // ── Workspace visibility (tenant) ────────────────────────────────────────

  getVisibility: (installId: string) =>
    apiClient.get<PluginVisibilityEntry[]>(`/api/v1/plugins/${installId}/visibility`),

  updateVisibility: (installId: string, data: PluginVisibilityUpdate[]) =>
    apiClient.patch<PluginVisibilityEntry[]>(`/api/v1/plugins/${installId}/visibility`, data),

  // ── Super admin — registry ───────────────────────────────────────────────

  listRegistry: (
    params?: { page?: number; search?: string; status?: string } | undefined
  ) => {
    const qs = new URLSearchParams();
    if (params?.page !== undefined) qs.set('page', String(params.page));
    if (params?.search !== undefined && params.search.length > 0) qs.set('search', params.search);
    if (params?.status !== undefined && params.status.length > 0) qs.set('status', params.status);
    const query = qs.toString();
    return apiClient.get<MarketplaceListResponse>(
      `/api/v1/admin/plugins${query ? '?' + query : ''}`
    );
  },

  register: (payload: PluginRegisterPayload) =>
    apiClient.post<PluginRegisterResponse>('/api/v1/admin/plugins/register', payload),

  publish: (slug: string) =>
    apiClient.post<void>(`/api/v1/admin/plugins/${slug}/publish`),

  unpublish: (slug: string) =>
    apiClient.post<void>(`/api/v1/admin/plugins/${slug}/unpublish`),

  // ── Super admin — DLQ ────────────────────────────────────────────────────

  listDlq: (
    params?: { page?: number; status?: string; pluginId?: string } | undefined
  ) => {
    const qs = new URLSearchParams();
    if (params?.page !== undefined) qs.set('page', String(params.page));
    if (params?.status !== undefined && params.status.length > 0) qs.set('status', params.status);
    if (params?.pluginId !== undefined && params.pluginId.length > 0) qs.set('pluginId', params.pluginId);
    const query = qs.toString();
    return apiClient.get<DlqListResponse>(
      `/api/v1/admin/system/dlq${query ? '?' + query : ''}`
    );
  },

  retryDlq: (id: string) =>
    apiClient.post<void>(`/api/v1/admin/system/dlq/${id}/retry`),

  dismissDlq: (id: string) =>
    apiClient.post<void>(`/api/v1/admin/system/dlq/${id}/dismiss`),

  getKafkaStatus: () =>
    apiClient.get<{ lag: number; status: string }[]>('/api/v1/admin/system/kafka'),
};
