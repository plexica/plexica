// File: apps/web/src/hooks/useUsers.ts
//
// T008-52 — TanStack Query hooks for Tenant Admin user management.
// Spec 008 Admin Interfaces

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getTenantUsers,
  inviteTenantUser,
  updateTenantUser,
  deactivateTenantUser,
  reactivateTenantUser,
  type TenantUserStatus,
  type InviteUserDto,
  type UpdateTenantUserDto,
} from '@/api/admin';

export function useTenantUsers(params?: {
  search?: string;
  status?: TenantUserStatus;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['tenant-admin', 'users', params],
    queryFn: () => getTenantUsers(params),
    staleTime: 15_000,
  });
}

export function useInviteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: InviteUserDto) => inviteTenantUser(dto),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tenant-admin', 'users'] });
    },
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateTenantUserDto }) =>
      updateTenantUser(id, dto),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tenant-admin', 'users'] });
    },
  });
}

export function useDeactivateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deactivateTenantUser(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tenant-admin', 'users'] });
    },
  });
}

export function useReactivateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => reactivateTenantUser(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tenant-admin', 'users'] });
    },
  });
}
