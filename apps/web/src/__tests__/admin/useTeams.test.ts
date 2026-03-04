// apps/web/src/__tests__/admin/useTeams.test.ts
//
// T008-61 — Unit tests for useTeams hooks.
// Spec 008 Admin Interfaces — Phase 8: Frontend Tests
//
// Covers: useTenantTeams, useCreateTeam, useUpdateTeam, useDeleteTeam,
//         useAddTeamMember, useRemoveTeamMember

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/api/admin', () => ({
  getTenantTeams: vi.fn(),
  createTenantTeam: vi.fn(),
  updateTenantTeam: vi.fn(),
  deleteTenantTeam: vi.fn(),
  addTeamMember: vi.fn(),
  removeTeamMember: vi.fn(),
}));

import {
  getTenantTeams,
  createTenantTeam,
  updateTenantTeam,
  deleteTenantTeam,
  addTeamMember,
  removeTeamMember,
} from '@/api/admin';
import type { Team, PaginatedResult } from '@/api/admin';
import {
  useTenantTeams,
  useCreateTeam,
  useUpdateTeam,
  useDeleteTeam,
  useAddTeamMember,
  useRemoveTeamMember,
} from '@/hooks/useTeams';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: qc }, children);
  };
}

function makeTeam(id: string, overrides?: Partial<Team>): Team {
  return {
    id,
    name: `Team ${id}`,
    description: `Description for team ${id}`,
    memberCount: 3,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-10T00:00:00Z',
    ...overrides,
  };
}

function makePaginatedTeams(teams: Team[], total = teams.length): PaginatedResult<Team> {
  return {
    data: teams,
    pagination: { page: 1, limit: 20, total, totalPages: Math.ceil(total / 20) },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useTenantTeams', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetches teams on mount', async () => {
    vi.mocked(getTenantTeams).mockResolvedValue(
      makePaginatedTeams([makeTeam('t1'), makeTeam('t2')])
    );

    const { result } = renderHook(() => useTenantTeams(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(getTenantTeams).toHaveBeenCalledWith(undefined);
    expect(result.current.data?.data).toHaveLength(2);
  });

  it('passes search and pagination params to API', async () => {
    vi.mocked(getTenantTeams).mockResolvedValue(makePaginatedTeams([]));

    const { result } = renderHook(() => useTenantTeams({ search: 'eng', page: 2, limit: 10 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(getTenantTeams).toHaveBeenCalledWith({ search: 'eng', page: 2, limit: 10 });
  });

  it('returns isError=true when API rejects', async () => {
    vi.mocked(getTenantTeams).mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useTenantTeams(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('useCreateTeam', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls createTenantTeam with the provided dto', async () => {
    const created = makeTeam('t-new');
    vi.mocked(createTenantTeam).mockResolvedValue(created);
    vi.mocked(getTenantTeams).mockResolvedValue(makePaginatedTeams([]));

    const { result } = renderHook(() => useCreateTeam(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ name: 'Engineering', description: 'Eng team' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(createTenantTeam).toHaveBeenCalledWith({ name: 'Engineering', description: 'Eng team' });
  });

  it('sets isError=true when creation fails', async () => {
    vi.mocked(createTenantTeam).mockRejectedValue(new Error('Duplicate name'));

    const { result } = renderHook(() => useCreateTeam(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ name: 'Duplicate' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('useUpdateTeam', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls updateTenantTeam with teamId and dto', async () => {
    vi.mocked(updateTenantTeam).mockResolvedValue(makeTeam('t1', { name: 'Updated' }));
    vi.mocked(getTenantTeams).mockResolvedValue(makePaginatedTeams([]));

    const { result } = renderHook(() => useUpdateTeam(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ teamId: 't1', dto: { name: 'Updated' } });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(updateTenantTeam).toHaveBeenCalledWith('t1', { name: 'Updated' });
  });
});

describe('useDeleteTeam', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls deleteTenantTeam with the teamId', async () => {
    vi.mocked(deleteTenantTeam).mockResolvedValue({ message: 'deleted' });
    vi.mocked(getTenantTeams).mockResolvedValue(makePaginatedTeams([]));

    const { result } = renderHook(() => useDeleteTeam(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate('t1');
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(deleteTenantTeam).toHaveBeenCalledWith('t1');
  });
});

describe('useAddTeamMember', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls addTeamMember with teamId and dto, then invalidates team queries', async () => {
    vi.mocked(addTeamMember).mockResolvedValue({
      userId: 'u1',
      email: 'user1@example.com',
      name: 'User One',
      role: 'MEMBER',
      joinedAt: '2026-01-01T00:00:00Z',
    });
    vi.mocked(getTenantTeams).mockResolvedValue(makePaginatedTeams([]));

    const { result } = renderHook(() => useAddTeamMember(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ teamId: 't1', dto: { userId: 'u1', role: 'MEMBER' } });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(addTeamMember).toHaveBeenCalledWith('t1', { userId: 'u1', role: 'MEMBER' });
  });
});

describe('useRemoveTeamMember', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls removeTeamMember with teamId and userId, then invalidates team queries', async () => {
    vi.mocked(removeTeamMember).mockResolvedValue({ message: 'removed' });
    vi.mocked(getTenantTeams).mockResolvedValue(makePaginatedTeams([]));

    const { result } = renderHook(() => useRemoveTeamMember(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ teamId: 't1', userId: 'u2' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(removeTeamMember).toHaveBeenCalledWith('t1', 'u2');
  });
});
