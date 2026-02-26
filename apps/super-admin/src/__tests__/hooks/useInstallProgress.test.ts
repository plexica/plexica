// File: apps/super-admin/src/__tests__/hooks/useInstallProgress.test.ts
//
// Unit tests for useInstallProgress hook (T004-29).
//
// Covers:
//   - Initial state: 6 pending steps, 'installing' status
//   - Elapsed timer increments
//   - Poll advances steps and transitions to 'complete' on INSTALLED lifecycle
//   - Poll transitions to 'failed' on API error
//   - Poll transitions to 'cancelled' on REGISTERED lifecycle
//   - cancel() calls cancelInstall API + sets cancelled status
//   - retry() resets state and calls installPlugin API

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// Mock api-client BEFORE importing the hook
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    getRegistryPlugin: vi.fn(),
    cancelInstall: vi.fn(),
    installPlugin: vi.fn(),
  },
  default: {
    getRegistryPlugin: vi.fn(),
    cancelInstall: vi.fn(),
    installPlugin: vi.fn(),
  },
}));

import { useInstallProgress } from '@/hooks/useInstallProgress';
import { apiClient } from '@/lib/api-client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePlugin(lifecycleStatus = 'INSTALLING') {
  return {
    id: 'p1',
    name: 'Test Plugin',
    version: '1.0.0',
    description: 'Test',
    author: 'Plexica',
    category: 'test',
    status: 'PUBLISHED' as const,
    lifecycleStatus: lifecycleStatus as 'INSTALLING' | 'INSTALLED' | 'REGISTERED' | 'ACTIVE',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

const DEFAULT_PROPS = {
  pluginId: 'p1',
  pollIntervalMs: 50, // fast for tests
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useInstallProgress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: still installing
    vi.mocked(apiClient.getRegistryPlugin).mockResolvedValue(makePlugin('INSTALLING') as never);
    vi.mocked(apiClient.cancelInstall).mockResolvedValue({ message: 'cancelled' } as never);
    vi.mocked(apiClient.installPlugin).mockResolvedValue(makePlugin('INSTALLING') as never);
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  // -------------------------------------------------------------------------
  // Initial state
  // -------------------------------------------------------------------------

  it('should start with 6 pending steps and installing status', () => {
    const { result } = renderHook(() => useInstallProgress(DEFAULT_PROPS));

    expect(result.current.steps).toHaveLength(6);
    expect(result.current.steps.every((s) => s.state === 'pending')).toBe(true);
    expect(result.current.overallStatus).toBe('installing');
  });

  it('should have correct step names', () => {
    const { result } = renderHook(() => useInstallProgress(DEFAULT_PROPS));

    const names = result.current.steps.map((s) => s.name);
    expect(names).toEqual([
      'Dependency Check',
      'Image Pull',
      'Data Migrations',
      'Route Registration',
      'Frontend Registration',
      'Health Check',
    ]);
  });

  it('should have step numbers 1-6', () => {
    const { result } = renderHook(() => useInstallProgress(DEFAULT_PROPS));

    const numbers = result.current.steps.map((s) => s.number);
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6]);
  });

  // -------------------------------------------------------------------------
  // Elapsed label
  // -------------------------------------------------------------------------

  it('should expose an elapsed label with "Elapsed:" prefix', () => {
    const { result } = renderHook(() => useInstallProgress(DEFAULT_PROPS));

    expect(result.current.elapsedLabel).toMatch(/^Elapsed: \d+\.\d+s$/);
  });

  // -------------------------------------------------------------------------
  // Poll → complete
  // -------------------------------------------------------------------------

  it('should transition to complete when poll returns INSTALLED', async () => {
    vi.useRealTimers();

    const onComplete = vi.fn();
    vi.mocked(apiClient.getRegistryPlugin).mockResolvedValue(makePlugin('INSTALLED') as never);

    const { result } = renderHook(() => useInstallProgress({ ...DEFAULT_PROPS, onComplete }));

    await waitFor(() => expect(result.current.overallStatus).toBe('complete'), { timeout: 2000 });
    expect(onComplete).toHaveBeenCalledOnce();
    expect(result.current.steps.every((s) => s.state === 'complete')).toBe(true);
  });

  it('should transition to complete when poll returns ACTIVE', async () => {
    vi.useRealTimers();

    vi.mocked(apiClient.getRegistryPlugin).mockResolvedValue(makePlugin('ACTIVE') as never);

    const { result } = renderHook(() => useInstallProgress({ ...DEFAULT_PROPS }));

    await waitFor(() => expect(result.current.overallStatus).toBe('complete'), { timeout: 2000 });
  });

  // -------------------------------------------------------------------------
  // Poll → failed
  // -------------------------------------------------------------------------

  it('should transition to failed when poll throws an error', async () => {
    vi.useRealTimers();

    vi.mocked(apiClient.getRegistryPlugin).mockRejectedValue(new Error('Connection refused'));

    const { result } = renderHook(() => useInstallProgress(DEFAULT_PROPS));

    await waitFor(() => expect(result.current.overallStatus).toBe('failed'), { timeout: 2000 });

    const failedStep = result.current.steps.find((s) => s.state === 'failed');
    expect(failedStep).toBeDefined();
    expect(failedStep?.errorMessage).toBe('Connection refused');
  });

  // -------------------------------------------------------------------------
  // Poll → cancelled (REGISTERED)
  // -------------------------------------------------------------------------

  it('should transition to cancelled when poll returns REGISTERED', async () => {
    vi.useRealTimers();

    const onCancel = vi.fn();
    vi.mocked(apiClient.getRegistryPlugin).mockResolvedValue(makePlugin('REGISTERED') as never);

    const { result } = renderHook(() => useInstallProgress({ ...DEFAULT_PROPS, onCancel }));

    await waitFor(() => expect(result.current.overallStatus).toBe('cancelled'), { timeout: 2000 });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // cancel()
  // -------------------------------------------------------------------------

  it('should call cancelInstall API and set cancelled status on cancel()', async () => {
    vi.useRealTimers();

    const onCancel = vi.fn();
    const { result } = renderHook(() => useInstallProgress({ ...DEFAULT_PROPS, onCancel }));

    await act(async () => {
      await result.current.cancel();
    });

    expect(apiClient.cancelInstall).toHaveBeenCalledWith('p1');
    expect(result.current.overallStatus).toBe('cancelled');
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('should set cancelled even when cancelInstall API throws', async () => {
    vi.useRealTimers();

    vi.mocked(apiClient.cancelInstall).mockRejectedValue(new Error('server error'));

    const { result } = renderHook(() => useInstallProgress(DEFAULT_PROPS));

    await act(async () => {
      await result.current.cancel();
    });

    expect(result.current.overallStatus).toBe('cancelled');
  });

  // -------------------------------------------------------------------------
  // retry()
  // -------------------------------------------------------------------------

  it('should reset steps to pending and set installing on retry()', async () => {
    vi.useRealTimers();

    // First make it fail
    vi.mocked(apiClient.getRegistryPlugin).mockRejectedValue(new Error('fail'));

    const { result } = renderHook(() => useInstallProgress(DEFAULT_PROPS));

    await waitFor(() => expect(result.current.overallStatus).toBe('failed'), { timeout: 2000 });

    // Now retry — subsequent polls return INSTALLING so it stays installing
    vi.mocked(apiClient.getRegistryPlugin).mockResolvedValue(makePlugin('INSTALLING') as never);

    await act(async () => {
      await result.current.retry();
    });

    expect(result.current.overallStatus).toBe('installing');
    expect(apiClient.installPlugin).toHaveBeenCalledWith('p1');
  });

  // -------------------------------------------------------------------------
  // Step advancement
  // -------------------------------------------------------------------------

  it('should advance running step index on each poll', async () => {
    vi.useRealTimers();

    // Always INSTALLING — multiple polls advance the running index
    vi.mocked(apiClient.getRegistryPlugin).mockResolvedValue(makePlugin('INSTALLING') as never);

    const { result } = renderHook(() =>
      useInstallProgress({ ...DEFAULT_PROPS, pollIntervalMs: 30 })
    );

    // After some polls, at least one step should have advanced past 'pending'
    await waitFor(
      () => {
        const hasRunningOrComplete = result.current.steps.some(
          (s) => s.state === 'running' || s.state === 'complete'
        );
        expect(hasRunningOrComplete).toBe(true);
      },
      { timeout: 3000, interval: 30 }
    );
  });

  // -------------------------------------------------------------------------
  // Data Migrations step (step index 2)
  // -------------------------------------------------------------------------

  it('should set migrationProgress on Data Migrations step when it is running', async () => {
    vi.useRealTimers();

    vi.mocked(apiClient.getRegistryPlugin).mockResolvedValue(makePlugin('INSTALLING') as never);

    const { result } = renderHook(() =>
      useInstallProgress({ ...DEFAULT_PROPS, pollIntervalMs: 30 })
    );

    // Wait until Data Migrations step is running AND has migrationProgress set
    await waitFor(
      () => {
        const dataMigStep = result.current.steps.find((s) => s.name === 'Data Migrations');
        expect(dataMigStep?.state).toBe('running');
        expect(dataMigStep?.migrationProgress).toBeGreaterThanOrEqual(0);
        expect(dataMigStep?.migrationProgress).toBeLessThanOrEqual(100);
      },
      { timeout: 3000, interval: 30 }
    );
  });
});
