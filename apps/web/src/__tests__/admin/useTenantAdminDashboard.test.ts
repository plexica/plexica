// apps/web/src/__tests__/admin/useTenantAdminDashboard.test.ts
//
// T008-61 — Unit tests for useTenantAdminDashboard hook.
// Spec 008 Admin Interfaces — Phase 8: Frontend Tests

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/api/admin', () => ({
  getTenantDashboard: vi.fn(),
}));

import { getTenantDashboard } from '@/api/admin';
import type { TenantDashboard } from '@/api/admin';
import { useTenantAdminDashboard } from '@/hooks/useTenantAdminDashboard';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
}

function createWrapper() {
  const qc = createQueryClient();
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: qc }, children);
  };
}

function makeDashboard(overrides?: Partial<TenantDashboard>): TenantDashboard {
  return {
    totalUsers: 10,
    activeUsers: 8,
    pendingInvitations: 2,
    totalTeams: 3,
    activePlugins: 5,
    storageUsedBytes: 1_000_000,
    apiCalls24h: 500,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useTenantAdminDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Query key and staleTime
  // -------------------------------------------------------------------------

  describe('query configuration', () => {
    it('fetches dashboard data on mount', async () => {
      vi.mocked(getTenantDashboard).mockResolvedValue(makeDashboard());

      const { result } = renderHook(() => useTenantAdminDashboard(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(getTenantDashboard).toHaveBeenCalledTimes(1);
      expect(result.current.data).toMatchObject({ totalUsers: 10, activeUsers: 8 });
    });

    it('exposes data with correct shape', async () => {
      const dashboard = makeDashboard({
        totalUsers: 42,
        activePlugins: 7,
        totalTeams: 5,
      });
      vi.mocked(getTenantDashboard).mockResolvedValue(dashboard);

      const { result } = renderHook(() => useTenantAdminDashboard(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.totalUsers).toBe(42);
      expect(result.current.data?.activePlugins).toBe(7);
      expect(result.current.data?.totalTeams).toBe(5);
    });

    it('returns isLoading=true initially', () => {
      vi.mocked(getTenantDashboard).mockReturnValue(new Promise(() => {}));

      const { result } = renderHook(() => useTenantAdminDashboard(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(true);
    });

    it('returns isError=true when API rejects', async () => {
      vi.mocked(getTenantDashboard).mockRejectedValue(new Error('Server error'));

      const { result } = renderHook(() => useTenantAdminDashboard(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toBeInstanceOf(Error);
    });

    it('data is undefined before first successful fetch', () => {
      vi.mocked(getTenantDashboard).mockReturnValue(new Promise(() => {}));

      const { result } = renderHook(() => useTenantAdminDashboard(), {
        wrapper: createWrapper(),
      });

      expect(result.current.data).toBeUndefined();
    });
  });
});
