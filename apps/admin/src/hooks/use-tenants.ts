// use-tenants.ts — TanStack Query hooks for tenant data + provisioning (S5-403).
// Search input is debounced 300ms before triggering a refetch.

import { useEffect, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getTenant, listTenants, provisionTenant, type ListTenantsParams } from '../services/admin-api.js';
import { ApiError } from '../services/api-client.js';

import type { ProvisionResult, TenantConflictType, TenantDetail, TenantListResponse } from '../types/admin-types.js';

export interface UseTenantListParams {
  search: string;
  status: string;
  page: number;
  pageSize: number;
}

export interface UseTenantListResult {
  data: TenantListResponse | undefined;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
}

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function useTenantList(params: UseTenantListParams): UseTenantListResult {
  const debouncedSearch = useDebouncedValue(params.search, 300);

  const queryParams: ListTenantsParams = {
    page: params.page,
    pageSize: params.pageSize,
    ...(debouncedSearch.trim() !== '' && { search: debouncedSearch.trim() }),
    ...(params.status !== 'all' && { status: params.status }),
  };

  const { data, isLoading, isFetching, isError } = useQuery({
    queryKey: ['admin', 'tenants', queryParams] as const,
    queryFn: () => listTenants(queryParams),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  return { data, isLoading, isFetching, isError };
}

export function useTenantDetail(id: string) {
  return useQuery<TenantDetail>({
    queryKey: ['admin', 'tenant', id] as const,
    queryFn: () => getTenant(id),
    enabled: (query) => {
      const status = query.state.data?.tenant.status;
      return id !== '' && status !== 'pending_deletion' && status !== 'deleted';
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

export interface ProvisionTenantError {
  conflictType: TenantConflictType | null;
  message: string;
}

export interface UseProvisionTenantResult {
  mutate: (input: { slug: string; name: string; adminEmail: string }) => void;
  isPending: boolean;
  isSuccess: boolean;
  isError: boolean;
  data: ProvisionResult | undefined;
  error: ProvisionTenantError | null;
  reset: () => void;
}

export function useProvisionTenant(): UseProvisionTenantResult {
  const queryClient = useQueryClient();

  const mutation = useMutation<
    ProvisionResult,
    ApiError,
    { slug: string; name: string; adminEmail: string }
  >({
    mutationFn: (input) => provisionTenant(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'tenants'] });
    },
  });

  const error: ProvisionTenantError | null = mutation.isError && mutation.error instanceof ApiError
    ? {
        conflictType:
          (mutation.error.conflictType as TenantConflictType | undefined) ?? null,
        message: mutation.error.message,
      }
    : mutation.isError
      ? { conflictType: null, message: (mutation.error as Error)?.message ?? 'Provisioning failed' }
      : null;

  return {
    mutate: mutation.mutate,
    isPending: mutation.isPending,
    isSuccess: mutation.isSuccess,
    isError: mutation.isError,
    data: mutation.data,
    error,
    reset: mutation.reset,
  };
}
