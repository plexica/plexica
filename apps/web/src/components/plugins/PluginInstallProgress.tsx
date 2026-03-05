// apps/web/src/components/plugins/PluginInstallProgress.tsx
//
// Plugin installation progress panel.
// Displays the 6-step install sequence with live status updates polled
// every 2 seconds via useInstallProgress.
//
// ARIA requirements (Constitution Art. 1.3 / WCAG 2.1 AA):
//   - Container: role="log" aria-live="polite" (live region for screen readers)
//   - Step list: role="list" with each row role="listitem" + aria-label
//   - Tenant migration progress: role="progressbar" with aria-valuenow/max
//   - Error panel: role="alert" (assertive announcement)
//
// Actions:
//   - Cancel button: visible while INSTALLING, calls adminApiClient.cancelInstall
//   - "Enable now?" button: visible on success (INSTALLED), calls onComplete
//   - Retry button: visible on failure, calls onRetry
//
// T004-29 — design-spec.md Screen 2

import { useEffect, useCallback, useState } from 'react';
import { Button, Spinner } from '@plexica/ui';
import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { toast } from '@/components/ToastProvider';
import { adminApiClient } from '@/lib/api-client';
import { useInstallProgress } from '@/hooks/useInstallProgress';
import { InstallStep } from './InstallStep';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PluginInstallProgressProps {
  /** Plugin ID to poll install progress for */
  pluginId: string;
  /** Display name shown in the header */
  pluginName: string;
  /** Version string (e.g. "1.2.0") */
  pluginVersion: string;
  /** Called when installation completes AND the user clicks "Enable now?" */
  onComplete: () => void;
  /** Called when the user successfully cancels the installation */
  onCancel: () => void;
  /** Called when the user clicks "Retry" after a failure */
  onRetry: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = String(seconds % 60).padStart(2, '0');
  return `${mins}m ${secs}s`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PluginInstallProgress({
  pluginId,
  pluginName,
  pluginVersion,
  onComplete,
  onCancel,
  onRetry,
}: PluginInstallProgressProps) {
  const { steps, elapsedSeconds, isPolling, error, isComplete, isFailed, lifecycleStatus } =
    useInstallProgress(pluginId);

  const [isCancelling, setIsCancelling] = useState(false);

  // -------------------------------------------------------------------------
  // Toast on completion / failure
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (isComplete) {
      toast.success(`${pluginName} v${pluginVersion} installed successfully.`);
    }
  }, [isComplete, pluginName, pluginVersion]);

  useEffect(() => {
    if (isFailed && error) {
      toast.error(`Installation of ${pluginName} failed: ${error}`);
    }
  }, [isFailed, error, pluginName]);

  // -------------------------------------------------------------------------
  // Cancel handler
  // -------------------------------------------------------------------------
  const handleCancel = useCallback(async () => {
    setIsCancelling(true);
    try {
      await adminApiClient.cancelInstall(pluginId);
      toast.success('Installation cancelled.');
      onCancel();
    } catch (err) {
      toast.error(
        `Failed to cancel installation: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    } finally {
      setIsCancelling(false);
    }
  }, [pluginId, onCancel]);

  // -------------------------------------------------------------------------
  // Derived state
  // -------------------------------------------------------------------------
  const isInstalling =
    lifecycleStatus === 'INSTALLING' || (lifecycleStatus === null && isPolling && !isComplete);
  const showCancelButton = isInstalling && !isCancelling;
  const showEnableButton = isComplete && lifecycleStatus === 'INSTALLED';

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <section
      role="log"
      aria-live="polite"
      aria-label={`Installation progress for ${pluginName}`}
      className="flex flex-col gap-4 rounded-lg border border-border bg-card p-6 shadow-sm"
    >
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                               */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-base font-semibold leading-tight">
            Installing {pluginName}
            <span className="ml-1.5 text-sm font-normal text-muted-foreground">
              v{pluginVersion}
            </span>
          </h2>
          <p className="text-xs text-muted-foreground">
            {isComplete
              ? 'Installation complete'
              : isFailed
                ? 'Installation failed'
                : 'Installation in progress…'}
          </p>
        </div>

        {/* Elapsed timer */}
        {!isComplete && !isFailed && (
          <div
            className="shrink-0 text-xs tabular-nums text-muted-foreground"
            aria-label={`Elapsed time: ${formatElapsed(elapsedSeconds)}`}
            aria-atomic="true"
          >
            {formatElapsed(elapsedSeconds)}
          </div>
        )}

        {/* Completion icon */}
        {isComplete && (
          <CheckCircle2
            className="h-6 w-6 shrink-0 text-green-500"
            aria-label="Installation complete"
          />
        )}
        {isFailed && (
          <XCircle className="h-6 w-6 shrink-0 text-destructive" aria-label="Installation failed" />
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Step list                                                            */}
      {/* ------------------------------------------------------------------ */}
      <ol
        role="list"
        aria-label="Installation steps"
        className="flex flex-col divide-y divide-border/50"
      >
        {steps.map((step) => (
          <InstallStep
            key={step.id}
            stepNumber={step.id}
            name={step.name}
            status={step.status}
            durationSeconds={step.durationSeconds}
            tenantProgress={step.tenantProgress}
          />
        ))}
      </ol>

      {/* ------------------------------------------------------------------ */}
      {/* Error panel                                                          */}
      {/* ------------------------------------------------------------------ */}
      {isFailed && error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-medium text-destructive">Installation failed</p>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Action buttons                                                       */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex items-center justify-end gap-3">
        {/* Loading indicator while polling but not yet in a terminal state */}
        {isPolling && !isComplete && !isFailed && (
          <Spinner size="sm" aria-label="Installation in progress" />
        )}

        {/* Cancel button */}
        {showCancelButton && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleCancel}
            disabled={isCancelling}
            aria-busy={isCancelling}
          >
            {isCancelling ? 'Cancelling…' : 'Cancel installation'}
          </Button>
        )}

        {/* Retry button — shown on failure */}
        {isFailed && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            Retry
          </Button>
        )}

        {/* Enable now button — shown when INSTALLED (not yet ACTIVE) */}
        {showEnableButton && (
          <Button variant="primary" size="sm" onClick={onComplete}>
            Enable now
          </Button>
        )}
      </div>
    </section>
  );
}
