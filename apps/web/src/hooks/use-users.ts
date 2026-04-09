// use-users.ts
// TanStack Query hooks for user management.
// Logic here — components only call these hooks, never API functions directly.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { userApi } from '../services/user-api.js';

interface UserFilters {
  search?: string;
  page?: number;
  limit?: number;
}

export function useUsers(filters?: UserFilters) {
  return useQuery({
    queryKey: ['users', filters],
    queryFn: () => userApi.list(filters),
  });
}

export function useRemoveUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => userApi.remove(userId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

export function useUserWorkspaces(userId: string) {
  return useQuery({
    queryKey: ['user-workspaces', userId],
    queryFn: () => userApi.getWorkspaces(userId),
    enabled: userId !== '',
  });
}
