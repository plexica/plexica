// apps/web/src/hooks/usePolicies.ts
//
// Phase 3a — TanStack Query hooks for authorization policies.
// Spec 003: Authorization System RBAC + ABAC

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getPolicies,
  createPolicy,
  updatePolicy,
  deletePolicy,
  type PolicyFilters,
  type CreatePolicyDto,
  type UpdatePolicyDto,
} from '@/hooks/useAuthorizationApi';

export function usePolicies(filters?: PolicyFilters) {
  return useQuery({
    queryKey: ['authz', 'policies', filters] as const,
    queryFn: () => getPolicies(filters),
    staleTime: 30_000,
  });
}

export function useCreatePolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreatePolicyDto) => createPolicy(dto),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['authz', 'policies'] });
    },
  });
}

export function useUpdatePolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdatePolicyDto }) => updatePolicy(id, dto),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['authz', 'policies'] });
    },
  });
}

export function useDeletePolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deletePolicy(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['authz', 'policies'] });
    },
  });
}
