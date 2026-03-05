// apps/web/src/__tests__/admin/useUsers.test.ts
//
// T008-61 — Unit tests for useUsers hooks.
// Spec 008 Admin Interfaces — Phase 8: Frontend Tests
//
// Covers: useTenantUsers, useInviteUser, useUpdateUser,
//         useDeactivateUser, useReactivateUser

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/api/admin', () => ({
  getTenantUsers: vi.fn(),
  inviteTenantUser: vi.fn(),
  updateTenantUser: vi.fn(),
  deactivateTenantUser: vi.fn(),
  reactivateTenantUser: vi.fn(),
}));

import {
  getTenantUsers,
  inviteTenantUser,
  updateTenantUser,
  deactivateTenantUser,
  reactivateTenantUser,
} from '@/api/admin';
import type { TenantUser, PaginatedResult } from '@/api/admin';
import {
  useTenantUsers,
  useInviteUser,
  useUpdateUser,
  useDeactivateUser,
  useReactivateUser,
} from '@/hooks/useUsers';

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

function makePaginatedUsers(
  users: Partial<TenantUser>[] = [],
  total = users.length
): PaginatedResult<TenantUser> {
  return {
    data: users as TenantUser[],
    pagination: { page: 1, limit: 20, total, totalPages: Math.ceil(total / 20) },
  };
}

function makeUser(id: string, overrides?: Partial<TenantUser>): TenantUser {
  return {
    id,
    email: `user-${id}@example.com`,
    name: `User ${id}`,
    status: 'active',
    roles: ['member'],
    teams: [],
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useTenantUsers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetches users on mount with no params', async () => {
    vi.mocked(getTenantUsers).mockResolvedValue(makePaginatedUsers([makeUser('u1')]));

    const { result } = renderHook(() => useTenantUsers(), { wrapper: createWrapper() });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(getTenantUsers).toHaveBeenCalledWith(undefined);
    expect(result.current.data?.data).toHaveLength(1);
    expect(result.current.data?.data[0].id).toBe('u1');
  });

  it('passes search and status params to API', async () => {
    vi.mocked(getTenantUsers).mockResolvedValue(makePaginatedUsers([]));

    const { result } = renderHook(
      () => useTenantUsers({ search: 'alice', status: 'active', page: 2, limit: 10 }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(getTenantUsers).toHaveBeenCalledWith({
      search: 'alice',
      status: 'active',
      page: 2,
      limit: 10,
    });
  });

  it('returns pagination metadata', async () => {
    vi.mocked(getTenantUsers).mockResolvedValue(
      makePaginatedUsers([makeUser('u1'), makeUser('u2')], 50)
    );

    const { result } = renderHook(() => useTenantUsers(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.pagination.total).toBe(50);
  });

  it('returns isError=true when API rejects', async () => {
    vi.mocked(getTenantUsers).mockRejectedValue(new Error('Fetch failed'));

    const { result } = renderHook(() => useTenantUsers(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
  });
});

describe('useInviteUser', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls inviteTenantUser and invalidates users query on success', async () => {
    const invited = makeUser('u-new', { status: 'invited' });
    vi.mocked(inviteTenantUser).mockResolvedValue(invited);
    vi.mocked(getTenantUsers).mockResolvedValue(makePaginatedUsers([]));

    const wrapper = createWrapper();
    const { result } = renderHook(() => useInviteUser(), { wrapper });

    await act(async () => {
      result.current.mutate({ email: 'new@example.com' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(inviteTenantUser).toHaveBeenCalledWith({ email: 'new@example.com' });
  });

  it('sets isError=true when invite fails', async () => {
    vi.mocked(inviteTenantUser).mockRejectedValue(new Error('Already exists'));

    const { result } = renderHook(() => useInviteUser(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ email: 'dupe@example.com' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('useUpdateUser', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls updateTenantUser with id and dto', async () => {
    const updated = makeUser('u1', { roles: ['admin'] });
    vi.mocked(updateTenantUser).mockResolvedValue(updated);
    vi.mocked(getTenantUsers).mockResolvedValue(makePaginatedUsers([]));

    const { result } = renderHook(() => useUpdateUser(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ id: 'u1', dto: { roleId: 'role-admin' } });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(updateTenantUser).toHaveBeenCalledWith('u1', { roleId: 'role-admin' });
  });
});

describe('useDeactivateUser', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls deactivateTenantUser with the user id', async () => {
    vi.mocked(deactivateTenantUser).mockResolvedValue(makeUser('u1', { status: 'inactive' }));
    vi.mocked(getTenantUsers).mockResolvedValue(makePaginatedUsers([]));

    const { result } = renderHook(() => useDeactivateUser(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate('u1');
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(deactivateTenantUser).toHaveBeenCalledWith('u1');
  });
});

describe('useReactivateUser', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls reactivateTenantUser with the user id', async () => {
    vi.mocked(reactivateTenantUser).mockResolvedValue(makeUser('u1', { status: 'active' }));
    vi.mocked(getTenantUsers).mockResolvedValue(makePaginatedUsers([]));

    const { result } = renderHook(() => useReactivateUser(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate('u1');
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(reactivateTenantUser).toHaveBeenCalledWith('u1');
  });
});
