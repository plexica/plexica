// use-roles.ts
// TanStack Query hooks for roles and permission matrix.
// Logic here — components only call these hooks, never API functions directly.

import { useQuery } from '@tanstack/react-query';

import { userApi } from '../services/user-api.js';

export function useRoles() {
  return useQuery({
    queryKey: ['roles'],
    queryFn: () => userApi.listRoles(),
    staleTime: 10 * 60 * 1000, // roles change rarely
  });
}

export function useActionMatrix() {
  return useQuery({
    queryKey: ['action-matrix'],
    queryFn: () => userApi.getActionMatrix(),
    staleTime: 10 * 60 * 1000,
  });
}
