// use-plugins.ts — TanStack Query hooks for plugin system domain (Spec 004).
// Tenant-side only: marketplace browsing, install/uninstall, visibility.
// Super-admin features (registry, publish/unpublish, DLQ) live in apps/admin
// (Decision 6, 2026-08-18).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { pluginApi } from '../services/plugin-api.js';

import type {
  PluginVisibilityUpdate,
} from '../types/plugin.js';

// ── Marketplace queries ──────────────────────────────────────────────────────

export function usePublishedPlugins(
  params?: { page?: number; pageSize?: number; search?: string; category?: string } | undefined
) {
  return useQuery({
    queryKey: ['plugins', 'published', params],
    queryFn: () => pluginApi.listPublished(params),
    staleTime: 30_000, // Catalog data changes infrequently
  });
}

export function usePluginDetail(slug: string) {
  return useQuery({
    queryKey: ['plugin', slug],
    queryFn: () => pluginApi.getPublished(slug),
    enabled: slug.length > 0,
  });
}

// ── Installed plugins queries ────────────────────────────────────────────────

export function useInstalledPlugins() {
  return useQuery({
    queryKey: ['plugins', 'installed'],
    queryFn: () => pluginApi.listInstalled(),
  });
}

export function useWorkspacePlugins(workspaceId: string) {
  return useQuery({
    queryKey: ['plugins', 'workspace', workspaceId],
    queryFn: () => pluginApi.listWorkspacePlugins(workspaceId),
    enabled: workspaceId.length > 0,
  });
}

export function usePluginVisibility(installId: string) {
  return useQuery({
    queryKey: ['plugin', 'visibility', installId],
    queryFn: () => pluginApi.getVisibility(installId),
    enabled: installId.length > 0,
  });
}

// ── Mutations: marketplace ────────────────────────────────────────────────────

export function useInstallPlugin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (slug: string) => pluginApi.install(slug),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['plugins', 'published'] });
      void queryClient.invalidateQueries({ queryKey: ['plugins', 'installed'] });
    },
  });
}

// ── Mutations: lifecycle ──────────────────────────────────────────────────────

export function useDeactivatePlugin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (installId: string) => pluginApi.deactivate(installId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['plugins', 'installed'] });
    },
  });
}

export function useReactivatePlugin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (installId: string) => pluginApi.reactivate(installId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['plugins', 'installed'] });
    },
  });
}

export function useUninstallPlugin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (installId: string) => pluginApi.uninstall(installId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['plugins', 'installed'] });
      void queryClient.invalidateQueries({ queryKey: ['plugins', 'published'] });
    },
  });
}

// ── Mutations: visibility ─────────────────────────────────────────────────────

export function useUpdatePluginVisibility(installId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: PluginVisibilityUpdate[]) =>
      pluginApi.updateVisibility(installId, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['plugin', 'visibility', installId] });
    },
  });
}
