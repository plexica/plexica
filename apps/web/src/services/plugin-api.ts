// plugin-api.ts — Typed API functions for plugin system domain (Spec 004).
// Tenant-side only: marketplace, install/uninstall, visibility.
// Super-admin functions (registry, publish/unpublish, DLQ) are in apps/admin
// (Decision 6, 2026-08-18).

import { apiClient } from './api-client.js';

import type {
  MarketplaceListResponse,
  PluginCatalogEntry,
  PluginInstallation,
  PluginVisibilityEntry,
  PluginVisibilityUpdate,
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
};
