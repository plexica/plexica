// use-dashboard-stats.ts
// Aggregates lightweight stats for the dashboard KPI cards.
// Each query fetches only 1 record to minimize payload — only the `total` field is used.

import { useQuery, keepPreviousData } from '@tanstack/react-query';

import { workspaceApi } from '../services/workspace-api.js';
import { userApi } from '../services/user-api.js';

export interface DashboardStats {
  workspaceCount: number | undefined;
  userCount: number | undefined;
  isWorkspaceLoading: boolean;
  isUserLoading: boolean;
  isWorkspaceError: boolean;
  isUserError: boolean;
  refetchWorkspaces: () => void;
  refetchUsers: () => void;
}

export function useDashboardStats(): DashboardStats {
  const workspaces = useQuery({
    queryKey: ['dashboard', 'workspace-count'],
    queryFn: () => workspaceApi.list({ limit: 1, status: 'active' }),
    staleTime: 2 * 60 * 1000,
    placeholderData: keepPreviousData,
  });

  const users = useQuery({
    queryKey: ['dashboard', 'user-count'],
    queryFn: () => userApi.list({ limit: 1 }),
    staleTime: 2 * 60 * 1000,
    placeholderData: keepPreviousData,
  });

  return {
    workspaceCount: workspaces.data?.total,
    userCount: users.data?.total,
    isWorkspaceLoading: workspaces.isPending,
    isUserLoading: users.isPending,
    isWorkspaceError: workspaces.isError,
    isUserError: users.isError,
    refetchWorkspaces: () => { void workspaces.refetch(); },
    refetchUsers: () => { void users.refetch(); },
  };
}
