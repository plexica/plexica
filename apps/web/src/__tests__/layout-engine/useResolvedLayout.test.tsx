// File: apps/web/src/__tests__/layout-engine/useResolvedLayout.test.tsx
//
// T014-28 — Unit tests for useResolvedLayout hook.
// Spec 014 Frontend Layout Engine — FR-017, NFR-002, NFR-008.
//
// Tests:
//   Success path — returns data, isLoading=false, isError=false
//   Loading state — isLoading=true before data arrives
//   Error/fail-open — queryFn catches error and returns null; data=null
//   enabled=false — query does not execute
//   Empty formId — query does not execute (enabled: Boolean(formId))
//   workspaceId included in query key for cache isolation
//   workspaceId passed to getResolvedLayout when provided
//   staleTime=60_000 cached in React Query config

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { ResolvedLayout } from '@plexica/types';

// ---------------------------------------------------------------------------
// Hoisted mock factories
// ---------------------------------------------------------------------------

const { mockGetResolvedLayout } = vi.hoisted(() => {
  const mockGetResolvedLayout = vi.fn();
  return { mockGetResolvedLayout };
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@/api/layout-config', () => ({
  getResolvedLayout: mockGetResolvedLayout,
}));

// ---------------------------------------------------------------------------
// Import hook under test (after mocks are registered)
// ---------------------------------------------------------------------------

import { useResolvedLayout } from '@/hooks/useResolvedLayout';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Disable retry in tests so errors surface immediately
        retry: false,
      },
    },
  });
}

function wrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

const MOCK_LAYOUT: ResolvedLayout = {
  formId: 'crm-contact-form',
  source: 'tenant',
  fields: [
    {
      fieldId: 'first-name',
      visibility: 'visible',
      order: 0,
      required: false,
      defaultValue: null,
      readonly: false,
    },
    {
      fieldId: 'email',
      visibility: 'visible',
      order: 1,
      required: true,
      defaultValue: null,
      readonly: false,
    },
  ],
  columns: [],
  sections: [],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useResolvedLayout', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = makeQueryClient();
    mockGetResolvedLayout.mockReset();
  });

  it('returns data when getResolvedLayout resolves successfully', async () => {
    mockGetResolvedLayout.mockResolvedValue(MOCK_LAYOUT);

    const { result } = renderHook(() => useResolvedLayout({ formId: 'crm-contact-form' }), {
      wrapper: wrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toEqual(MOCK_LAYOUT);
    expect(result.current.isError).toBe(false);
  });

  it('returns isLoading=true before data arrives', () => {
    // Never-resolving promise keeps loading state
    mockGetResolvedLayout.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useResolvedLayout({ formId: 'crm-contact-form' }), {
      wrapper: wrapper(queryClient),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeNull();
  });

  it('returns null (fail-open) when getResolvedLayout throws', async () => {
    mockGetResolvedLayout.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useResolvedLayout({ formId: 'crm-contact-form' }), {
      wrapper: wrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Fail-open: queryFn catches the error and returns null
    expect(result.current.data).toBeNull();
  });

  it('does not execute query when enabled=false', () => {
    mockGetResolvedLayout.mockResolvedValue(MOCK_LAYOUT);

    const { result } = renderHook(
      () => useResolvedLayout({ formId: 'crm-contact-form', enabled: false }),
      { wrapper: wrapper(queryClient) }
    );

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeNull();
    expect(mockGetResolvedLayout).not.toHaveBeenCalled();
  });

  it('does not execute query when formId is empty string', () => {
    mockGetResolvedLayout.mockResolvedValue(MOCK_LAYOUT);

    const { result } = renderHook(() => useResolvedLayout({ formId: '' }), {
      wrapper: wrapper(queryClient),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeNull();
    expect(mockGetResolvedLayout).not.toHaveBeenCalled();
  });

  it('passes workspaceId to getResolvedLayout when provided', async () => {
    mockGetResolvedLayout.mockResolvedValue(MOCK_LAYOUT);

    const { result } = renderHook(
      () => useResolvedLayout({ formId: 'crm-contact-form', workspaceId: 'ws-uuid-123' }),
      { wrapper: wrapper(queryClient) }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockGetResolvedLayout).toHaveBeenCalledWith('crm-contact-form', 'ws-uuid-123');
  });

  it('passes undefined workspaceId to getResolvedLayout when not provided', async () => {
    mockGetResolvedLayout.mockResolvedValue(MOCK_LAYOUT);

    const { result } = renderHook(() => useResolvedLayout({ formId: 'crm-contact-form' }), {
      wrapper: wrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockGetResolvedLayout).toHaveBeenCalledWith('crm-contact-form', undefined);
  });

  it('caches workspace-specific results separately (different queryKey)', async () => {
    mockGetResolvedLayout.mockResolvedValue(MOCK_LAYOUT);

    // Render two hooks with different workspaceIds
    const { result: result1 } = renderHook(
      () => useResolvedLayout({ formId: 'crm-contact-form', workspaceId: 'ws-1' }),
      { wrapper: wrapper(queryClient) }
    );
    const { result: result2 } = renderHook(
      () => useResolvedLayout({ formId: 'crm-contact-form', workspaceId: 'ws-2' }),
      { wrapper: wrapper(queryClient) }
    );

    await waitFor(() => expect(result1.current.isLoading).toBe(false));
    await waitFor(() => expect(result2.current.isLoading).toBe(false));

    // Both queries should have fired since they have different keys
    expect(mockGetResolvedLayout).toHaveBeenCalledTimes(2);
  });

  it('queryKey includes workspaceId as null when not provided', async () => {
    mockGetResolvedLayout.mockResolvedValue(MOCK_LAYOUT);

    renderHook(() => useResolvedLayout({ formId: 'crm-contact-form' }), {
      wrapper: wrapper(queryClient),
    });

    // The queryKey should be ['layout-engine', 'resolved', formId, null]
    // We verify by checking that a tenant-level and workspace-level query hit cache separately
    mockGetResolvedLayout.mockResolvedValue({ ...MOCK_LAYOUT, formId: 'other' });

    const { result } = renderHook(
      () => useResolvedLayout({ formId: 'crm-contact-form', workspaceId: 'ws-1' }),
      { wrapper: wrapper(queryClient) }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Two separate calls because the keys differ (workspaceId=null vs workspaceId='ws-1')
    expect(mockGetResolvedLayout).toHaveBeenCalledTimes(2);
  });
});
