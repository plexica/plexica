// File: apps/web/src/hooks/useRoles.ts
//
// T008-54 — TanStack Query hooks for Tenant Admin role management.
// Spec 008 Admin Interfaces
//
// Also exports Spec 003 access-control hooks (useRoles, useRole, useCreateRoleV2, etc.)
// using the /api/v1/roles endpoints.

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
import {
  getRoles,
  createRole,
  updateRole,
  deleteRole,
  assignUserRole,
  removeUserRole,
  getMyRoles,
  getMyPermissions,
  type RoleFilters,
  type CreateRoleDto as CreateRoleDtoV2,
  type UpdateRoleDto as UpdateRoleDtoV2,
} from '@/hooks/useAuthorizationApi';

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

// ---------------------------------------------------------------------------
// Spec 003 — /api/v1/roles access-control hooks
// ---------------------------------------------------------------------------

/** List roles with optional filters. queryKey: ['authz', 'roles', filters] */
export function useRoles(filters?: RoleFilters) {
  return useQuery({
    queryKey: ['authz', 'roles', filters] as const,
    queryFn: () => getRoles(filters),
    staleTime: 30_000,
  });
}

/** Get a single role by id. queryKey: ['authz', 'roles', id] */
export function useRole(id: string) {
  return useQuery({
    queryKey: ['authz', 'roles', id] as const,
    queryFn: async () => {
      const all = await getRoles({ limit: 1000 });
      return all.data.find((r) => r.id === id) ?? null;
    },
    staleTime: 30_000,
    enabled: !!id,
  });
}

/** Create a custom role via POST /api/v1/roles */
export function useCreateRoleV2() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateRoleDtoV2) => createRole(dto),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['authz', 'roles'] });
    },
  });
}

/** Update a role via PUT /api/v1/roles/:id */
export function useUpdateRoleV2() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateRoleDtoV2 }) => updateRole(id, dto),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['authz', 'roles'] });
    },
  });
}

/** Delete a role via DELETE /api/v1/roles/:id */
export function useDeleteRoleV2() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteRole(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['authz', 'roles'] });
    },
  });
}

/** Assign a role to a user via POST /api/v1/users/:id/roles */
export function useAssignUserRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, roleId }: { userId: string; roleId: string }) =>
      assignUserRole(userId, roleId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['authz', 'roles'] });
      void qc.invalidateQueries({ queryKey: ['tenant-admin', 'users'] });
    },
  });
}

/** Remove a role from a user via DELETE /api/v1/users/:id/roles/:roleId */
export function useRemoveUserRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, roleId }: { userId: string; roleId: string }) =>
      removeUserRole(userId, roleId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['authz', 'roles'] });
      void qc.invalidateQueries({ queryKey: ['tenant-admin', 'users'] });
    },
  });
}

/** Get the current user's roles via GET /api/v1/me/roles */
export function useMyRoles() {
  return useQuery({
    queryKey: ['authz', 'me', 'roles'] as const,
    queryFn: getMyRoles,
    staleTime: 60_000,
  });
}

/** Get the current user's effective permissions via GET /api/v1/me/permissions */
export function useMyPermissions() {
  return useQuery({
    queryKey: ['authz', 'me', 'permissions'] as const,
    queryFn: getMyPermissions,
    staleTime: 60_000,
  });
}
