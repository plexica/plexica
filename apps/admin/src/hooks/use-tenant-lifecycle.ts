// use-tenant-lifecycle.ts — TanStack Query hooks for tenant lifecycle actions
// (S5-503 suspend, S5-603 reactivate, S5-704 delete + deletion saga status).
// Non-destructive mutations refetch tenant detail. Deletion instead updates the
// cached detail because its backing tenant resources are intentionally erased.

import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient, type MutateOptions } from '@tanstack/react-query';

import {
  deleteTenant,
  getDeletionStatus,
  reactivateTenant,
  retryDeletionStep,
  suspendTenant,
} from '../services/admin-api.js';
import { ApiError } from '../services/api-client.js';

import type {
  DeletionStatusResponse,
  TenantDetail,
  TenantStatus,
} from '../types/admin-types.js';

const TENANT_LIST_KEY = ['admin', 'tenants'] as const;

function tenantDetailKey(id: string): readonly unknown[] {
  return ['admin', 'tenant', id] as const;
}

function invalidateTenantList(queryClient: ReturnType<typeof useQueryClient>): void {
  void queryClient.invalidateQueries({ queryKey: TENANT_LIST_KEY });
}

function invalidateTenantQueries(id: string, queryClient: ReturnType<typeof useQueryClient>): void {
  invalidateTenantList(queryClient);
  void queryClient.invalidateQueries({ queryKey: tenantDetailKey(id), exact: true });
}

function setCachedTenantStatus(
  queryClient: ReturnType<typeof useQueryClient>,
  tenantId: string,
  status: TenantStatus
): void {
  queryClient.setQueryData<TenantDetail>(tenantDetailKey(tenantId), (current) =>
    current === undefined
      ? current
      : { ...current, tenant: { ...current.tenant, status } }
  );
}

// ── Suspend (S5-503) ────────────────────────────────────────────────────────

export interface UseSuspendTenantResult {
  mutate: (input: { id: string; version: number }, options?: MutateOptions<unknown, ApiError, { id: string; version: number }>) => void;
  isPending: boolean;
  error: ApiError | null;
  reset: () => void;
}

export function useSuspendTenant(): UseSuspendTenantResult {
  const queryClient = useQueryClient();
  const mutation = useMutation<unknown, ApiError, { id: string; version: number }>({
    mutationFn: ({ id, version }) => suspendTenant(id, version),
    onSuccess: (_data, variables) => invalidateTenantQueries(variables.id, queryClient),
  });
  return {
    mutate: mutation.mutate,
    isPending: mutation.isPending,
    error: mutation.error ?? null,
    reset: mutation.reset,
  };
}

// ── Reactivate (S5-603) ─────────────────────────────────────────────────────

export interface UseReactivateTenantResult {
  mutate: (input: { id: string; version: number }, options?: MutateOptions<unknown, ApiError, { id: string; version: number }>) => void;
  isPending: boolean;
  error: ApiError | null;
  reset: () => void;
}

export function useReactivateTenant(): UseReactivateTenantResult {
  const queryClient = useQueryClient();
  const mutation = useMutation<unknown, ApiError, { id: string; version: number }>({
    mutationFn: ({ id, version }) => reactivateTenant(id, version),
    onSuccess: (_data, variables) => invalidateTenantQueries(variables.id, queryClient),
  });
  return {
    mutate: mutation.mutate,
    isPending: mutation.isPending,
    error: mutation.error ?? null,
    reset: mutation.reset,
  };
}

// ── Delete (S5-704) ─────────────────────────────────────────────────────────

export interface UseDeleteTenantResult {
  mutate: (input: { id: string; confirmSlug: string; version: number }, options?: MutateOptions<unknown, ApiError, { id: string; confirmSlug: string; version: number }>) => void;
  isPending: boolean;
  error: ApiError | null;
  reset: () => void;
}

export function useDeleteTenant(): UseDeleteTenantResult {
  const queryClient = useQueryClient();
  const mutation = useMutation<unknown, ApiError, { id: string; confirmSlug: string; version: number }>({
    mutationFn: ({ id, confirmSlug, version }) => deleteTenant(id, confirmSlug, version),
    onSuccess: async (_data, variables) => {
      await queryClient.cancelQueries({ queryKey: tenantDetailKey(variables.id), exact: true });
      setCachedTenantStatus(queryClient, variables.id, 'pending_deletion');
      invalidateTenantList(queryClient);
    },
  });
  return {
    mutate: mutation.mutate,
    isPending: mutation.isPending,
    error: mutation.error ?? null,
    reset: mutation.reset,
  };
}

// ── Deletion status (S5-704 — polled saga snapshot) ─────────────────────────
//
// Polls every 5s while any step is pending or in_progress, and stops once all
// steps are done or any step has failed. Stopping on failure lets the operator
// decide to retry without the panel fighting a re-render loop.

function isPolling(data: DeletionStatusResponse | undefined): boolean {
  if (data === undefined || data.steps.length === 0) return true;
  const hasFailed = data.steps.some((s) => s.status === 'failed');
  if (hasFailed) return false;
  const allDone = data.steps.every((s) => s.status === 'done');
  return !allDone;
}

export interface UseDeletionStatusResult {
  data: DeletionStatusResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useDeletionStatus(tenantId: string): UseDeletionStatusResult {
  const queryClient = useQueryClient();
  const query = useQuery<DeletionStatusResponse, ApiError>({
    queryKey: ['admin', 'tenant', tenantId, 'deletion-status'] as const,
    queryFn: () => getDeletionStatus(tenantId),
    refetchInterval: (query) => (isPolling(query.state.data) ? 5000 : false),
    enabled: tenantId !== '',
  });
  const completed =
    query.data !== undefined &&
    query.data.steps.length > 0 &&
    query.data.steps.every((step) => step.status === 'done');

  useEffect(() => {
    if (!completed) return;
    setCachedTenantStatus(queryClient, tenantId, 'deleted');
    invalidateTenantList(queryClient);
  }, [completed, queryClient, tenantId]);

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => void query.refetch(),
  };
}

// ── Retry a failed deletion step (S5-704) ───────────────────────────────────

export interface UseRetryDeletionStepResult {
  mutate: (stepId: string) => void;
  isPending: boolean;
  error: ApiError | null;
  reset: () => void;
}

export function useRetryDeletionStep(
  tenantId: string
): UseRetryDeletionStepResult {
  const queryClient = useQueryClient();
  const mutation = useMutation<unknown, ApiError, string>({
    mutationFn: (stepId: string) => retryDeletionStep(stepId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['admin', 'tenant', tenantId, 'deletion-status'] as const,
      });
    },
  });
  return {
    mutate: (stepId: string, options?: MutateOptions<unknown, ApiError, string>) =>
      mutation.mutate(stepId, options),
    isPending: mutation.isPending,
    error: mutation.error ?? null,
    reset: mutation.reset,
  };
}
