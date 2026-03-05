// File: apps/web/src/hooks/useTeams.ts
//
// T008-53 — TanStack Query hooks for Tenant Admin team management.
// Spec 008 Admin Interfaces

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getTenantTeams,
  createTenantTeam,
  updateTenantTeam,
  deleteTenantTeam,
  addTeamMember,
  removeTeamMember,
  type CreateTeamDto,
  type UpdateTeamDto,
  type AddTeamMemberDto,
} from '@/api/admin';

export function useTenantTeams(params?: { search?: string; page?: number; limit?: number }) {
  return useQuery({
    queryKey: ['tenant-admin', 'teams', params],
    queryFn: () => getTenantTeams(params),
    staleTime: 15_000,
  });
}

export function useCreateTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateTeamDto) => createTenantTeam(dto),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tenant-admin', 'teams'] });
    },
  });
}

export function useUpdateTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ teamId, dto }: { teamId: string; dto: UpdateTeamDto }) =>
      updateTenantTeam(teamId, dto),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tenant-admin', 'teams'] });
    },
  });
}

export function useDeleteTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (teamId: string) => deleteTenantTeam(teamId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tenant-admin', 'teams'] });
    },
  });
}

export function useAddTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ teamId, dto }: { teamId: string; dto: AddTeamMemberDto }) =>
      addTeamMember(teamId, dto),
    onSuccess: (_data, { teamId }) => {
      void qc.invalidateQueries({ queryKey: ['tenant-admin', 'teams', teamId] });
      void qc.invalidateQueries({ queryKey: ['tenant-admin', 'teams'] });
    },
  });
}

export function useRemoveTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ teamId, userId }: { teamId: string; userId: string }) =>
      removeTeamMember(teamId, userId),
    onSuccess: (_data, { teamId }) => {
      void qc.invalidateQueries({ queryKey: ['tenant-admin', 'teams', teamId] });
      void qc.invalidateQueries({ queryKey: ['tenant-admin', 'teams'] });
    },
  });
}
