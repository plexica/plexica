// use-plugins.ts — TanStack Query hooks for the plugin catalog (S5-803).
// Data fetching + mutation via TanStack Query only (Rule 3: one pattern).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { listPlugins, reviewPlugin } from '../services/admin-api.js';

import type { Plugin } from '../types/admin-types.js';

export function usePluginList() {
  return useQuery<{ data: Plugin[], total: number, page: number, pageSize: number }>({
    queryKey: ['admin', 'plugins'] as const,
    queryFn: () => listPlugins(),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

export interface ReviewPluginInput {
  slug: string;
  decision: 'approve' | 'reject';
  notes: string;
}

export function useReviewPlugin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ slug, decision, notes }: ReviewPluginInput) => {
      const trimmed = notes.trim();
      if (trimmed.length > 0) return reviewPlugin(slug, decision, trimmed);
      return reviewPlugin(slug, decision);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'plugins'] });
    },
  });
}
