// use-workspaces.ts
// TanStack Query hooks for workspace CRUD operations.
// Logic here — components only call these hooks, never API functions directly.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { workspaceApi } from '../services/workspace-api.js';

import type {
  CreateWorkspacePayload,
  UpdateWorkspacePayload,
  ReparentPayload,
} from '../types/workspace.js';

interface WorkspaceFilters {
  status?: 'active' | 'archived';
  parentId?: string;
  page?: number;
  limit?: number;
}

export function useWorkspaces(filters?: WorkspaceFilters) {
  return useQuery({
    queryKey: ['workspaces', filters],
    queryFn: () => workspaceApi.list(filters),
  });
}

export function useWorkspace(id: string) {
  return useQuery({
    queryKey: ['workspace', id],
    queryFn: () => workspaceApi.get(id),
    enabled: id !== '',
  });
}

export function useWorkspaceHierarchy(id: string) {
  return useQuery({
    queryKey: ['workspace-hierarchy', id],
    queryFn: () => workspaceApi.hierarchy(id),
    enabled: id !== '',
  });
}

export function useCreateWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateWorkspacePayload) => workspaceApi.create(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    },
  });
}

export function useUpdateWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateWorkspacePayload }) =>
      workspaceApi.update(id, payload),
    onSuccess: (_data, { id }) => {
      void queryClient.invalidateQueries({ queryKey: ['workspace', id] });
      void queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    },
  });
}

export function useDeleteWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => workspaceApi.delete(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    },
  });
}

export function useRestoreWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => workspaceApi.restore(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    },
  });
}

export function useReparentWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ReparentPayload }) =>
      workspaceApi.reparent(id, payload),
    onSuccess: (_data, { id }) => {
      void queryClient.invalidateQueries({ queryKey: ['workspace', id] });
      void queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    },
  });
}
