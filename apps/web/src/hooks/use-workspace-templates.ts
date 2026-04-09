// use-workspace-templates.ts
// TanStack Query hooks for workspace templates.
// Logic here — components only call these hooks, never API functions directly.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { workspaceApi } from '../services/workspace-api.js';

export function useWorkspaceTemplates() {
  return useQuery({
    queryKey: ['workspace-templates'],
    queryFn: () => workspaceApi.listTemplates(),
    staleTime: 10 * 60 * 1000, // templates change rarely
  });
}

export function useCreateTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { name: string; description?: string; structure: unknown[] }) =>
      workspaceApi.createTemplate(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workspace-templates'] });
    },
  });
}
