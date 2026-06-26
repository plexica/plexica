// use-workspace-members.ts
// TanStack Query hooks for workspace member management.
// Logic here — components only call these hooks, never API functions directly.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { workspaceApi } from '../services/workspace-api.js';

export function useWorkspaceMembers(workspaceId: string) {
  return useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () => workspaceApi.listMembers(workspaceId),
    enabled: workspaceId !== '',
  });
}

export function useAddWorkspaceMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      workspaceId,
      userId,
      role,
    }: {
      workspaceId: string;
      userId: string;
      role: string;
    }) => workspaceApi.addMember(workspaceId, { userId, role }),
    onSuccess: (_data, { workspaceId }) => {
      void queryClient.invalidateQueries({ queryKey: ['workspace-members', workspaceId] });
    },
  });
}

export function useRemoveWorkspaceMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ workspaceId, userId }: { workspaceId: string; userId: string }) =>
      workspaceApi.removeMember(workspaceId, userId),
    onSuccess: (_data, { workspaceId }) => {
      void queryClient.invalidateQueries({ queryKey: ['workspace-members', workspaceId] });
    },
  });
}

export function useChangeMemberRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      workspaceId,
      userId,
      role,
    }: {
      workspaceId: string;
      userId: string;
      role: string;
    }) => workspaceApi.changeMemberRole(workspaceId, userId, role),
    // Optimistic update — patch the cache immediately, rollback on error
    onMutate: async ({ workspaceId, userId, role }) => {
      await queryClient.cancelQueries({ queryKey: ['workspace-members', workspaceId] });
      const previous = queryClient.getQueryData<{ data: Array<{ userId: string; role: string }> }>(['workspace-members', workspaceId]);
      if (previous !== undefined) {
        queryClient.setQueryData(['workspace-members', workspaceId], {
          ...previous,
          data: previous.data.map((m) => (m.userId === userId ? { ...m, role } : m)),
        });
      }
      return { previous };
    },
    onError: (_err, { workspaceId }, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(['workspace-members', workspaceId], context.previous);
      }
    },
    onSettled: (_data, _error, { workspaceId }) => {
      void queryClient.invalidateQueries({ queryKey: ['workspace-members', workspaceId] });
    },
  });
}
