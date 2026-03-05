// File: apps/super-admin/src/hooks/useSystemConfig.ts
//
// T008-48 — hook for the Super Admin System Config screen.
//
// Wraps getSystemConfig / updateSystemConfig from api/admin.ts with
// React Query, exposing an optimistic-update mutation so the UI feels
// snappy even on slow connections.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getSystemConfig,
  updateSystemConfig,
  type SystemConfigEntry,
  type UpdateSystemConfigDto,
} from '@/api/admin';

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSystemConfig(category?: string) {
  const queryClient = useQueryClient();

  // -------------------------------------------------------------------------
  // Query
  // -------------------------------------------------------------------------
  const query = useQuery<SystemConfigEntry[], Error>({
    queryKey: ['systemConfig', category],
    queryFn: () => getSystemConfig(category),
    staleTime: 60_000,
  });

  // -------------------------------------------------------------------------
  // Mutation — updates a single key, with optimistic update
  // -------------------------------------------------------------------------
  const mutation = useMutation<
    SystemConfigEntry,
    Error,
    { key: string; dto: UpdateSystemConfigDto }
  >({
    mutationFn: ({ key, dto }) => updateSystemConfig(key, dto),

    // Optimistic update: swap the value in the cache immediately so the UI
    // reflects the change without waiting for the server round-trip.
    onMutate: async ({ key, dto }) => {
      // Cancel any in-flight refetches that might overwrite our optimistic data.
      await queryClient.cancelQueries({ queryKey: ['systemConfig', category] });

      // Snapshot the current data for rollback.
      const previous = queryClient.getQueryData<SystemConfigEntry[]>(['systemConfig', category]);

      queryClient.setQueryData<SystemConfigEntry[]>(['systemConfig', category], (old = []) =>
        old.map((entry) => (entry.key === key ? { ...entry, value: dto.value } : entry))
      );

      return { previous };
    },

    // Roll back if the server rejects the mutation.
    onError: (_err, _vars, context) => {
      const ctx = context as { previous?: SystemConfigEntry[] } | undefined;
      if (ctx?.previous !== undefined) {
        queryClient.setQueryData(['systemConfig', category], ctx.previous);
      }
    },

    // Always re-sync from the server after settle (success or error).
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['systemConfig', category] });
    },
  });

  return {
    entries: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,

    updateEntry: mutation.mutate,
    updateEntryAsync: mutation.mutateAsync,
    isUpdating: mutation.isPending,
    updateError: mutation.error,
  };
}
