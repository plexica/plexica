// use-plugins.ts — TanStack Query hooks for plugin system domain (Spec 004).
// Follows the same pattern as use-audit-log.ts, use-workspaces.ts, etc.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { pluginApi } from '../services/plugin-api.js';

import type {
  PluginCatalogEntry,
  PluginInstallation,
  PluginRegisterPayload,
  PluginVisibilityEntry,
  PluginVisibilityUpdate,
  DeadLetterEntry,
  MarketplaceListResponse,
  DlqListResponse,
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

export function usePluginVisibility(installId: string) {
  return useQuery({
    queryKey: ['plugin', 'visibility', installId],
    queryFn: () => pluginApi.getVisibility(installId),
    enabled: installId.length > 0,
  });
}

// ── Admin registry queries ────────────────────────────────────────────────────

export function usePluginRegistry(
  params?: { page?: number; search?: string; status?: string } | undefined
) {
  return useQuery({
    queryKey: ['plugins', 'registry', params],
    queryFn: () => pluginApi.listRegistry(params),
  });
}

// ── DLQ queries ───────────────────────────────────────────────────────────────

export function useDlqEntries(
  params?: { page?: number; status?: string; pluginId?: string } | undefined
) {
  return useQuery({
    queryKey: ['dlq', params],
    queryFn: () => pluginApi.listDlq(params),
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

// ── Mutations: admin registry ─────────────────────────────────────────────────

export function useRegisterPlugin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: PluginRegisterPayload) => pluginApi.register(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['plugins', 'registry'] });
    },
  });
}

export function usePublishPlugin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (slug: string) => pluginApi.publish(slug),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['plugins', 'registry'] });
      void queryClient.invalidateQueries({ queryKey: ['plugins', 'published'] });
    },
  });
}

export function useUnpublishPlugin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (slug: string) => pluginApi.unpublish(slug),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['plugins', 'registry'] });
      void queryClient.invalidateQueries({ queryKey: ['plugins', 'published'] });
    },
  });
}

// ── Mutations: DLQ ────────────────────────────────────────────────────────────

export function useRetryDlq() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => pluginApi.retryDlq(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['dlq'] });
    },
  });
}

export function useDismissDlq() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => pluginApi.dismissDlq(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['dlq'] });
    },
  });
}
