// File: apps/super-admin/src/hooks/useAdminPlugins.ts
//
// T008-46 — hook for the Super Admin Plugin List + Config screens.
//
// Separate from the existing usePlugins.ts (which targets the marketplace
// API).  This hook targets the tenant-level plugin endpoint and exposes
// enable / disable mutations for the admin portal.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AdminPlugin {
  id: string;
  name: string;
  version: string;
  description?: string;
  status: 'INSTALLED' | 'ACTIVE' | 'DISABLED' | 'UNINSTALLED';
  config?: Record<string, unknown>;
}

interface PluginListResponse {
  data: AdminPlugin[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Cast helper — apiClient's protected HTTP methods need an escape hatch.
type CastClient = {
  get: <T>(url: string) => Promise<T>;
  patch: <T>(url: string, data: unknown) => Promise<T>;
};

function cast(): CastClient {
  return apiClient as unknown as CastClient;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

async function fetchAdminPlugins(): Promise<AdminPlugin[]> {
  const res = await cast().get<PluginListResponse | AdminPlugin[]>('/api/v1/plugins');
  // Handle both array and paginated-envelope responses
  if (Array.isArray(res)) return res;
  return (res as PluginListResponse).data ?? [];
}

async function enablePlugin(pluginId: string): Promise<AdminPlugin> {
  return cast().patch<AdminPlugin>(`/api/v1/plugins/${pluginId}/enable`, {});
}

async function disablePlugin(pluginId: string): Promise<AdminPlugin> {
  return cast().patch<AdminPlugin>(`/api/v1/plugins/${pluginId}/disable`, {});
}

async function updatePluginConfig(
  pluginId: string,
  config: Record<string, unknown>
): Promise<AdminPlugin> {
  return cast().patch<AdminPlugin>(`/api/v1/admin/plugins/${pluginId}/config`, { config });
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAdminPlugins() {
  const queryClient = useQueryClient();

  const query = useQuery<AdminPlugin[], Error>({
    queryKey: ['adminPlugins'],
    queryFn: fetchAdminPlugins,
    staleTime: 60_000,
  });

  const enableMutation = useMutation<AdminPlugin, Error, string>({
    mutationFn: enablePlugin,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['adminPlugins'] });
    },
  });

  const disableMutation = useMutation<AdminPlugin, Error, string>({
    mutationFn: disablePlugin,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['adminPlugins'] });
    },
  });

  const updateConfigMutation = useMutation<
    AdminPlugin,
    Error,
    { pluginId: string; config: Record<string, unknown> }
  >({
    mutationFn: ({ pluginId, config }) => updatePluginConfig(pluginId, config),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['adminPlugins'] });
    },
  });

  return {
    plugins: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,

    enablePlugin: enableMutation.mutate,
    isEnabling: enableMutation.isPending,
    enableError: enableMutation.error,

    disablePlugin: disableMutation.mutate,
    isDisabling: disableMutation.isPending,
    disableError: disableMutation.error,

    updateConfig: updateConfigMutation.mutate,
    updateConfigAsync: updateConfigMutation.mutateAsync,
    isUpdatingConfig: updateConfigMutation.isPending,
    updateConfigError: updateConfigMutation.error,
  };
}
