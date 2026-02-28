// apps/super-admin/src/hooks/useInstallProgress.ts
//
// Hook for T004-29: manages plugin install progress state.
//
// Responsibilities:
//   - Polls GET /api/v1/plugins/:id every 2 s to detect lifecycle transitions
//   - Maps lifecycle status to synthetic step states (heuristic — real step
//     data would come from an SSE/websocket feed in a future iteration)
//   - Maintains elapsed timer (increments every second, formatted as "Elapsed: Xs")
//   - Exposes cancel() handler (DELETE /api/v1/plugins/:id/install)
//
// Step states: 'pending' | 'running' | 'complete' | 'failed' | 'skipped'
//
// The 6 installation steps (from design-spec.md Screen 2):
//   1. Dependency Check
//   2. Image Pull
//   3. Data Migrations   (has per-tenant sub-progress when running)
//   4. Route Registration
//   5. Frontend Registration
//   6. Health Check

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { apiClient } from '@/lib/api-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InstallStepState = 'pending' | 'running' | 'complete' | 'failed' | 'skipped';

export interface TenantMigrationRow {
  tenantId: string;
  tenantName: string;
  state: 'pending' | 'running' | 'complete';
  duration?: string; // e.g. "0.8s"
}

export interface InstallStepData {
  /** 1-based step number */
  number: number;
  name: string;
  state: InstallStepState;
  /** Duration label shown when complete, e.g. "0.3s" */
  duration?: string;
  /** Inline detail text shown below the step name */
  detail?: string;
  /** Per-tenant migration sub-list (step 3 only) */
  tenantRows?: TenantMigrationRow[];
  /** Progress 0-100 for step 3 progress bar */
  migrationProgress?: number;
  /** Error message (failed state only) */
  errorMessage?: string;
  /** Recovery suggestion (failed state only) */
  errorSuggestion?: string;
}

export type OverallStatus = 'installing' | 'complete' | 'failed' | 'cancelled';

// ---------------------------------------------------------------------------
// Step definitions
// ---------------------------------------------------------------------------

const STEP_NAMES: string[] = [
  'Dependency Check',
  'Image Pull',
  'Data Migrations',
  'Route Registration',
  'Frontend Registration',
  'Health Check',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatElapsed(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function initialSteps(): InstallStepData[] {
  return STEP_NAMES.map((name, idx) => ({
    number: idx + 1,
    name,
    state: 'pending' as InstallStepState,
  }));
}

/**
 * Naive step-advancement heuristic based on poll responses.
 * In production a real SSE/WS feed would deliver per-step events.
 * Here we simulate forward progress: each 2-s poll advances the
 * "running" step index by one.
 */
function advanceSteps(
  prev: InstallStepData[],
  runningStepIdx: number,
  elapsedMs: number
): InstallStepData[] {
  return prev.map((step, idx) => {
    if (idx < runningStepIdx) {
      // Already-passed steps → complete
      return {
        ...step,
        state: 'complete' as InstallStepState,
        duration: step.duration ?? formatElapsed(Math.max(300, elapsedMs / (runningStepIdx || 1))),
      };
    }
    if (idx === runningStepIdx) {
      return {
        ...step,
        state: 'running' as InstallStepState,
        // Data Migrations (step index 2) gets a simulated progress bar
        migrationProgress:
          idx === 2 ? Math.min(99, Math.round((elapsedMs / 6000) * 100)) : undefined,
      };
    }
    // Upcoming steps
    return { ...step, state: 'pending' as InstallStepState };
  });
}

function failSteps(
  steps: InstallStepData[],
  failedIdx: number,
  errorMessage: string
): InstallStepData[] {
  return steps.map((step, idx) => {
    if (idx < failedIdx) return { ...step, state: 'complete' as InstallStepState };
    if (idx === failedIdx) {
      return {
        ...step,
        state: 'failed' as InstallStepState,
        errorMessage,
        errorSuggestion: 'Check the plugin manifest and ensure all dependencies are reachable.',
      };
    }
    return { ...step, state: 'skipped' as InstallStepState };
  });
}

function completeAllSteps(steps: InstallStepData[], totalMs: number): InstallStepData[] {
  return steps.map((step, idx) => ({
    ...step,
    state: 'complete' as InstallStepState,
    duration: step.duration ?? formatElapsed(totalMs / (STEP_NAMES.length - idx)),
  }));
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 2000;
const TIMER_INTERVAL_MS = 100; // 100 ms ticks for smooth elapsed display

export interface UseInstallProgressOptions {
  pluginId: string;
  onComplete?: () => void;
  onCancel?: () => void;
  /** Override poll interval for tests */
  pollIntervalMs?: number;
}

export function useInstallProgress({
  pluginId,
  onComplete,
  onCancel,
  pollIntervalMs = POLL_INTERVAL_MS,
}: UseInstallProgressOptions) {
  const [steps, setSteps] = useState<InstallStepData[]>(initialSteps);
  const [overallStatus, setOverallStatus] = useState<OverallStatus>('installing');
  const [elapsedMs, setElapsedMs] = useState(0);

  // Track which step index is currently "running" during simulated progression
  const runningStepIdxRef = useRef(0);
  const startTimeRef = useRef<number>(0);
  const isCancelledRef = useRef(false);

  // Initialize start time on mount — done in useLayoutEffect to avoid calling
  // the impure Date.now() during render (React Compiler purity rule).
  useLayoutEffect(() => {
    startTimeRef.current = Date.now();
  }, []);

  // --------------------------------------------------------------------------
  // Elapsed timer — 100 ms ticks
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (overallStatus !== 'installing') return;

    const id = setInterval(() => {
      setElapsedMs(Date.now() - startTimeRef.current);
    }, TIMER_INTERVAL_MS);

    return () => clearInterval(id);
  }, [overallStatus]);

  // --------------------------------------------------------------------------
  // Polling
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (overallStatus !== 'installing') return;

    const id = setInterval(async () => {
      if (isCancelledRef.current) return;

      try {
        const plugin = await apiClient.getRegistryPlugin(pluginId);
        const ls = plugin.lifecycleStatus;
        const elapsed = Date.now() - startTimeRef.current;

        if (ls === 'INSTALLED' || ls === 'ACTIVE') {
          // Installation complete — mark all steps done
          setSteps((prev) => completeAllSteps(prev, elapsed));
          setOverallStatus('complete');
          onComplete?.();
          return;
        }

        if (ls === 'REGISTERED') {
          // Reverted — likely cancelled externally
          setOverallStatus('cancelled');
          onCancel?.();
          return;
        }

        // Still INSTALLING — advance to the next step index on each poll
        runningStepIdxRef.current = Math.min(runningStepIdxRef.current + 1, STEP_NAMES.length - 1);

        setSteps((prev) => advanceSteps(prev, runningStepIdxRef.current, elapsed));
      } catch (err) {
        // API error → mark current running step as failed
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        setSteps((prev) => failSteps(prev, runningStepIdxRef.current, errorMsg));
        setOverallStatus('failed');
      }
    }, pollIntervalMs);

    return () => clearInterval(id);
  }, [pluginId, overallStatus, onComplete, onCancel, pollIntervalMs]);

  // --------------------------------------------------------------------------
  // Cancel handler
  // --------------------------------------------------------------------------
  const cancel = useCallback(async () => {
    isCancelledRef.current = true;
    setOverallStatus('cancelled');
    try {
      await apiClient.cancelInstall(pluginId);
    } catch {
      // Best-effort — UI still transitions to cancelled
    }
    onCancel?.();
  }, [pluginId, onCancel]);

  // --------------------------------------------------------------------------
  // Retry handler — resets state and re-triggers installation
  // --------------------------------------------------------------------------
  const retry = useCallback(async () => {
    isCancelledRef.current = false;
    startTimeRef.current = Date.now();
    runningStepIdxRef.current = 0;
    setElapsedMs(0);
    setSteps(initialSteps());
    setOverallStatus('installing');
    try {
      await apiClient.installPlugin(pluginId);
    } catch {
      // If re-trigger fails, keep showing the "installing" skeleton until next poll
    }
  }, [pluginId]);

  // --------------------------------------------------------------------------
  // Derived values
  // --------------------------------------------------------------------------
  const elapsedLabel = `Elapsed: ${(elapsedMs / 1000).toFixed(1)}s`;

  return {
    steps,
    overallStatus,
    elapsedMs,
    elapsedLabel,
    cancel,
    retry,
  };
}
