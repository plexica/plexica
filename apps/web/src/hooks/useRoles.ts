// File: apps/web/src/hooks/useRoles.ts
//
// T008-54 — TanStack Query hooks for Tenant Admin role management.
// Spec 008 Admin Interfaces

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getTenantRoles,
  createTenantRole,
  updateTenantRole,
  deleteTenantRole,
  getTenantPermissions,
  type CreateRoleDto,
  type UpdateRoleDto,
} from '@/api/admin';

export function useTenantRoles() {
  return useQuery({
    queryKey: ['tenant-admin', 'roles'],
    queryFn: getTenantRoles,
    staleTime: 30_000,
  });
}

export function useTenantPermissions() {
  return useQuery({
    queryKey: ['tenant-admin', 'permissions'],
    queryFn: getTenantPermissions,
    staleTime: 300_000, // permissions change rarely
  });
}

export function useCreateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateRoleDto) => createTenantRole(dto),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tenant-admin', 'roles'] });
    },
  });
}

export function useUpdateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ roleId, dto }: { roleId: string; dto: UpdateRoleDto }) =>
      updateTenantRole(roleId, dto),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tenant-admin', 'roles'] });
    },
  });
}

export function useDeleteRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (roleId: string) => deleteTenantRole(roleId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tenant-admin', 'roles'] });
    },
  });
}
