// use-logs.ts — TanStack Query hook for the admin system logs endpoint (S5-A04).
// No auto-refresh: queries run only when `enabled` is true (explicit Search
// button per wireframe — Loki queries are expensive). Data fetching uses
// TanStack Query only — Rule 3 (one pattern per operation).

import { useQuery } from '@tanstack/react-query';

import { getLogs } from '../services/admin-api.js';

import type { LogEntry } from '../types/admin-types.js';

export interface LogsQueryParams {
  tenant?: string;
  level?: string;
  limit?: number;
}

export interface LogsResult {
  logs: LogEntry[];
  total: number;
}

export function useLogs(params: LogsQueryParams, enabled: boolean) {
  return useQuery<LogsResult>({
    queryKey: ['admin', 'logs', params] as const,
    queryFn: () => getLogs(params),
    enabled,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
