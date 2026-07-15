// use-tenants.ts — TanStack Query hook for the tenant list.
// Search input is debounced 300ms before triggering a refetch.

import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { listTenants, type ListTenantsParams } from '../services/admin-api.js';
import type { TenantListResponse } from '../types/admin-types.js';

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
