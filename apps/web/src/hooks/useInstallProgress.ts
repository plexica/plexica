// apps/web/src/hooks/useInstallProgress.ts
//
// Hook managing the 6-step plugin installation progress panel.
//
// Step state is inferred from the plugin's `lifecycleStatus` value polled
// from `GET /api/v1/plugins/:id` every 2 seconds via adminApiClient.
//
// Step ordering:
//  1. Dependency Check
//  2. Image Pull
//  3. Data Migrations
//  4. Route Registration
//  5. Frontend Registration
//  6. Health Check
//
// T004-33 — design-spec.md Screen 2

import { useState, useEffect, useCallback, useRef } from 'react';
import { adminApiClient } from '@/lib/api-client';
import type { PluginLifecycleStatus } from '@plexica/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StepStatus = 'pending' | 'running' | 'complete' | 'failed' | 'skipped';

export interface InstallStep {
  id: number;
  name: string;
  status: StepStatus;
  /** Elapsed duration in seconds (set when step transitions to complete/failed) */
  durationSeconds?: number;
  /** Per-tenant migration sub-list — only populated for step 3 */
  tenantProgress?: TenantMigrationProgress[];
}

export interface TenantMigrationProgress {
  tenantId: string;
  tenantName: string;
  complete: boolean;
}

export interface UseInstallProgressResult {
  steps: InstallStep[];
  /** Overall elapsed seconds since hook mounted (updates every second) */
  elapsedSeconds: number;
  /** True while actively polling */
  isPolling: boolean;
  /** Set when a step fails */
  error: string | null;
  /** True when all 6 steps are complete */
  isComplete: boolean;
  /** True when any step has failed */
  isFailed: boolean;
  /** Current lifecycle status from the server */
  lifecycleStatus: PluginLifecycleStatus | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 2_000;

const STEP_DEFINITIONS: Pick<InstallStep, 'id' | 'name'>[] = [
  { id: 1, name: 'Dependency Check' },
  { id: 2, name: 'Image Pull' },
  { id: 3, name: 'Data Migrations' },
  { id: 4, name: 'Route Registration' },
  { id: 5, name: 'Frontend Registration' },
  { id: 6, name: 'Health Check' },
];

function makeInitialSteps(): InstallStep[] {
  return STEP_DEFINITIONS.map((s, idx) => ({
    ...s,
    status: idx === 0 ? 'running' : 'pending',
  }));
}

// ---------------------------------------------------------------------------
// Step advancement helper (pure function — used only inside poll())
//
// Rules:
//  - INSTALLING, no error → advance the current "running" step to "complete"
//    and start the next one (called once per poll tick after the first).
//  - INSTALLING, with error → mark the running step "failed", rest "skipped".
//  - INSTALLED / ACTIVE → all steps complete.
//  - REGISTERED → cancelled / reverted; leave steps as-is.
// ---------------------------------------------------------------------------

function advanceStep(
  currentSteps: InstallStep[],
  status: PluginLifecycleStatus,
  errorMessage: string | null,
  stepStartTimes: Record<number, number>
): InstallStep[] {
  switch (status) {
    case 'INSTALLED':
    case 'ACTIVE':
      return currentSteps.map((s) => ({ ...s, status: 'complete' as StepStatus }));

    case 'REGISTERED':
      return currentSteps;

    case 'INSTALLING': {
      if (errorMessage) {
        // Mark the currently-running step as failed, rest as skipped
        const failedIdx = currentSteps.findIndex((s) => s.status === 'running');
        if (failedIdx === -1) return currentSteps;
        const now = Date.now();
        return currentSteps.map((s, idx) => {
          if (idx === failedIdx) {
            const start = stepStartTimes[s.id] ?? now;
            return {
              ...s,
              status: 'failed' as StepStatus,
              durationSeconds: Math.round((now - start) / 100) / 10,
            };
          }
          if (idx > failedIdx) return { ...s, status: 'skipped' as StepStatus };
          return s;
        });
      }

      // Advance the running step one position
      const runningIdx = currentSteps.findIndex((s) => s.status === 'running');
      if (runningIdx === -1) {
        // No running step — start from first pending
        const firstPending = currentSteps.findIndex((s) => s.status === 'pending');
        if (firstPending === -1) return currentSteps;
        const now = Date.now();
        stepStartTimes[currentSteps[firstPending].id] = now;
        return currentSteps.map((s, idx) => ({
          ...s,
          status: idx === firstPending ? ('running' as StepStatus) : s.status,
        }));
      }

      // If already on the last step, don't advance
      if (runningIdx + 1 >= currentSteps.length) return currentSteps;

      const now = Date.now();
      const start = stepStartTimes[currentSteps[runningIdx].id] ?? now;
      const nextId = currentSteps[runningIdx + 1].id;
      stepStartTimes[nextId] = now;

      return currentSteps.map((s, idx) => {
        if (idx === runningIdx) {
          return {
            ...s,
            status: 'complete' as StepStatus,
            durationSeconds: Math.round((now - start) / 100) / 10,
          };
        }
        if (idx === runningIdx + 1) {
          return { ...s, status: 'running' as StepStatus };
        }
        return s;
      });
    }

    default:
      return currentSteps;
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useInstallProgress(pluginId: string | null): UseInstallProgressResult {
  const [steps, setSteps] = useState<InstallStep[]>(makeInitialSteps);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [lifecycleStatus, setLifecycleStatus] = useState<PluginLifecycleStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Use refs for values that need to be read inside callbacks without causing
  // the callback (and therefore the polling interval) to be recreated.
  const errorRef = useRef<string | null>(null);
  const stepStartTimes = useRef<Record<number, number>>({});
  const pollCountRef = useRef(0);
  const mountTime = useRef(0);

  // Keep errorRef in sync with state
  useEffect(() => {
    errorRef.current = error;
  }, [error]);

  // -------------------------------------------------------------------------
  // Elapsed timer — updates every second
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!pluginId) return;
    mountTime.current = Date.now();
    const timer = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - mountTime.current) / 1000));
    }, 1_000);
    return () => clearInterval(timer);
  }, [pluginId]);

  // -------------------------------------------------------------------------
  // Poll — stable callback (no state in deps; uses refs instead)
  // -------------------------------------------------------------------------
  const poll = useCallback(async () => {
    if (!pluginId) return;
    try {
      const plugin = await adminApiClient.getRegistryPlugin(pluginId);
      const status = plugin.lifecycleStatus ?? null;
      setLifecycleStatus(status);

      if (!status) return;

      const currentPollCount = ++pollCountRef.current;

      setSteps((prev) => {
        // On the very first poll, derive the initial state from the status
        // without advancing any step (we don't know how long we've been here).
        if (currentPollCount === 1) {
          // Just map lifecycle → step states without any step advancement
          if (status === 'INSTALLED' || status === 'ACTIVE') {
            return prev.map((s) => ({ ...s, status: 'complete' as StepStatus }));
          }
          return prev;
        }

        // On subsequent polls, advance the running step one position
        return advanceStep(prev, status, errorRef.current, stepStartTimes.current);
      });
    } catch (err) {
      // Don't stop polling on transient network errors
      if (err instanceof Error && !err.message.includes('network')) {
        setError(err.message);
        errorRef.current = err.message;
      }
    }
  }, [pluginId]); // stable — no state deps; reads error via ref

  // -------------------------------------------------------------------------
  // Polling interval — auto-stops when complete or failed
  // -------------------------------------------------------------------------
  const isComplete = steps.every((s) => s.status === 'complete');
  const isFailed = steps.some((s) => s.status === 'failed');

  // Derived: no state needed — polling is active whenever we have a pluginId
  // and have not yet reached a terminal state.
  const isPolling = Boolean(pluginId) && !isComplete && !isFailed;

  useEffect(() => {
    if (!pluginId) return;
    // Stop polling when we have reached a terminal state
    if (isComplete || isFailed) return;

    // Schedule the initial poll asynchronously to avoid calling setState
    // synchronously inside an effect body (react-compiler lint rule).
    const immediate = setTimeout(poll, 0);
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      clearTimeout(immediate);
      clearInterval(interval);
    };
  }, [pluginId, poll, isComplete, isFailed]);

  return {
    steps,
    elapsedSeconds,
    isPolling,
    error,
    isComplete,
    isFailed,
    lifecycleStatus,
  };
}
