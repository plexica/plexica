// apps/web/src/__tests__/admin/useRoles.test.ts
//
// T008-61 — Unit tests for useRoles hooks.
// Spec 008 Admin Interfaces — Phase 8: Frontend Tests
//
// Covers: useTenantRoles, useTenantPermissions,
//         useCreateRole, useUpdateRole, useDeleteRole

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/api/admin', () => ({
  getTenantRoles: vi.fn(),
  getTenantPermissions: vi.fn(),
  createTenantRole: vi.fn(),
  updateTenantRole: vi.fn(),
  deleteTenantRole: vi.fn(),
}));

import {
  getTenantRoles,
  getTenantPermissions,
  createTenantRole,
  updateTenantRole,
  deleteTenantRole,
} from '@/api/admin';
import type { TenantRole, PermissionGroup } from '@/api/admin';
import {
  useTenantRoles,
  useTenantPermissions,
  useCreateRole,
  useUpdateRole,
  useDeleteRole,
} from '@/hooks/useRoles';

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

function makeRole(id: string, overrides?: Partial<TenantRole>): TenantRole {
  return {
    id,
    name: `Role ${id}`,
    description: `Description for role ${id}`,
    isSystem: false,
    permissions: [],
    userCount: 0,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-10T00:00:00Z',
    ...overrides,
  };
}

function makePermissionGroup(source: string): PermissionGroup {
  return {
    source,
    displayName: `${source} Permissions`,
    permissions: [
      { id: `${source}-p1`, name: `${source}:read`, resource: source, action: 'read' },
      { id: `${source}-p2`, name: `${source}:write`, resource: source, action: 'write' },
    ],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useTenantRoles', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetches roles on mount', async () => {
    vi.mocked(getTenantRoles).mockResolvedValue([makeRole('r1'), makeRole('r2')]);

    const { result } = renderHook(() => useTenantRoles(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(getTenantRoles).toHaveBeenCalledTimes(1);
    expect(result.current.data).toHaveLength(2);
    expect(result.current.data?.[0].id).toBe('r1');
  });

  it('returns system and custom roles', async () => {
    vi.mocked(getTenantRoles).mockResolvedValue([
      makeRole('sys-admin', { isSystem: true, name: 'Admin' }),
      makeRole('custom-r1', { isSystem: false, name: 'Custom Role' }),
    ]);

    const { result } = renderHook(() => useTenantRoles(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const systemRoles = result.current.data?.filter((r) => r.isSystem);
    const customRoles = result.current.data?.filter((r) => !r.isSystem);
    expect(systemRoles).toHaveLength(1);
    expect(customRoles).toHaveLength(1);
  });

  it('returns isError=true when API rejects', async () => {
    vi.mocked(getTenantRoles).mockRejectedValue(new Error('Unauthorized'));

    const { result } = renderHook(() => useTenantRoles(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('useTenantPermissions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetches permission groups on mount', async () => {
    vi.mocked(getTenantPermissions).mockResolvedValue([
      makePermissionGroup('workspace'),
      makePermissionGroup('users'),
    ]);

    const { result } = renderHook(() => useTenantPermissions(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(getTenantPermissions).toHaveBeenCalledTimes(1);
    expect(result.current.data).toHaveLength(2);
    expect(result.current.data?.[0].source).toBe('workspace');
  });

  it('returns groups with their permissions', async () => {
    vi.mocked(getTenantPermissions).mockResolvedValue([makePermissionGroup('plugins')]);

    const { result } = renderHook(() => useTenantPermissions(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.[0].permissions).toHaveLength(2);
    expect(result.current.data?.[0].permissions[0].action).toBe('read');
  });
});

describe('useCreateRole', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls createTenantRole with the provided dto', async () => {
    const created = makeRole('r-new', { name: 'Editor' });
    vi.mocked(createTenantRole).mockResolvedValue(created);
    vi.mocked(getTenantRoles).mockResolvedValue([]);

    const { result } = renderHook(() => useCreateRole(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ name: 'Editor', permissions: ['workspace:read'] });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(createTenantRole).toHaveBeenCalledWith({
      name: 'Editor',
      permissions: ['workspace:read'],
    });
  });

  it('invalidates roles query on success', async () => {
    vi.mocked(createTenantRole).mockResolvedValue(makeRole('r-new'));
    // getTenantRoles is called once on mount (useTenantRoles) and again after
    // invalidation triggered by the successful mutation (useCreateRole).
    const spy = vi.mocked(getTenantRoles).mockResolvedValue([]);

    // Render both hooks sharing the same QueryClient so invalidation triggers a refetch.
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children);

    const { result: rolesResult } = renderHook(() => useTenantRoles(), { wrapper });
    const { result: createResult } = renderHook(() => useCreateRole(), { wrapper });

    // Wait for initial fetch
    await waitFor(() => expect(rolesResult.current.isSuccess).toBe(true));

    const callsBefore = spy.mock.calls.length;

    await act(async () => {
      createResult.current.mutate({ name: 'New Role', permissions: [] });
    });

    await waitFor(() => expect(createResult.current.isSuccess).toBe(true));
    // After invalidation, getTenantRoles should have been called again
    await waitFor(() => expect(spy.mock.calls.length).toBeGreaterThan(callsBefore));
  });

  it('sets isError=true when creation fails', async () => {
    vi.mocked(createTenantRole).mockRejectedValue(new Error('Role name taken'));

    const { result } = renderHook(() => useCreateRole(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ name: 'Duplicate', permissions: [] });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('useUpdateRole', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls updateTenantRole with roleId and dto', async () => {
    vi.mocked(updateTenantRole).mockResolvedValue(makeRole('r1', { name: 'Updated Name' }));
    vi.mocked(getTenantRoles).mockResolvedValue([]);

    const { result } = renderHook(() => useUpdateRole(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ roleId: 'r1', dto: { name: 'Updated Name' } });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(updateTenantRole).toHaveBeenCalledWith('r1', { name: 'Updated Name' });
  });

  it('can update permissions array', async () => {
    vi.mocked(updateTenantRole).mockResolvedValue(
      makeRole('r1', { permissions: ['workspace:read', 'workspace:write'] })
    );
    vi.mocked(getTenantRoles).mockResolvedValue([]);

    const { result } = renderHook(() => useUpdateRole(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({
        roleId: 'r1',
        dto: { permissions: ['workspace:read', 'workspace:write'] },
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(updateTenantRole).toHaveBeenCalledWith('r1', {
      permissions: ['workspace:read', 'workspace:write'],
    });
  });
});

describe('useDeleteRole', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls deleteTenantRole with the roleId', async () => {
    vi.mocked(deleteTenantRole).mockResolvedValue({ message: 'deleted' });
    vi.mocked(getTenantRoles).mockResolvedValue([]);

    const { result } = renderHook(() => useDeleteRole(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate('r1');
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(deleteTenantRole).toHaveBeenCalledWith('r1');
  });

  it('sets isError=true when deletion fails (system role)', async () => {
    vi.mocked(deleteTenantRole).mockRejectedValue(new Error('Cannot delete system role'));

    const { result } = renderHook(() => useDeleteRole(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate('sys-admin');
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
  });
});
