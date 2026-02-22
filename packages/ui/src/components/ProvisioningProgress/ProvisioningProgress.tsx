// File: packages/ui/src/components/ProvisioningProgress/ProvisioningProgress.tsx
// T001-18: Real-time provisioning status display per Spec 001 design spec.
//
// Features:
// - Per-step list with status icons (pending / in-progress / complete / error / skipped)
// - Overall progress bar
// - Estimated time remaining
// - Retry attempt counter
// - Success state / Failure state
// - aria-live="polite" announcements

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Progress } from '../Progress/Progress';
import { CheckCircle2, Circle, Loader2, XCircle, SkipForward, RefreshCw } from 'lucide-react';
import { Button } from '../Button/Button';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProvisioningStepStatus = 'pending' | 'in_progress' | 'complete' | 'error' | 'skipped';

export interface ProvisioningStepInfo {
  name: string;
  label: string;
  status: ProvisioningStepStatus;
  /** Error message when status is 'error' */
  errorMessage?: string;
  /** Current retry attempt (1-based, shown when > 0) */
  retryAttempt?: number;
}

export interface ProvisioningProgressProps {
  steps: ProvisioningStepInfo[];
  /** 0–100 */
  overallProgress: number;
  /** Estimated seconds remaining */
  estimatedSecondsRemaining?: number;
  /** Whether all steps succeeded */
  isSuccess?: boolean;
  /** Whether provisioning failed */
  isError?: boolean;
  /** Top-level error message when isError */
  errorMessage?: string;
  /** Called when user clicks the Retry button (isError state) */
  onRetry?: () => void;
  className?: string;
}

// ─── Step icon ───────────────────────────────────────────────────────────────

function StepIcon({ status }: { status: ProvisioningStepStatus }) {
  switch (status) {
    case 'complete':
      return <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" aria-hidden="true" />;
    case 'in_progress':
      return <Loader2 className="w-5 h-5 text-primary shrink-0 animate-spin" aria-hidden="true" />;
    case 'error':
      return <XCircle className="w-5 h-5 text-destructive shrink-0" aria-hidden="true" />;
    case 'skipped':
      return <SkipForward className="w-5 h-5 text-muted-foreground shrink-0" aria-hidden="true" />;
    default:
      return <Circle className="w-5 h-5 text-muted-foreground shrink-0" aria-hidden="true" />;
  }
}

// ─── Format seconds ──────────────────────────────────────────────────────────

function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function ProvisioningProgress({
  steps,
  overallProgress,
  estimatedSecondsRemaining,
  isSuccess = false,
  isError = false,
  errorMessage,
  onRetry,
  className,
}: ProvisioningProgressProps) {
  // The aria-live region is separate so screen readers announce changes without
  // re-reading the entire component tree.
  const [announcement, setAnnouncement] = React.useState('');

  const prevStepsRef = React.useRef<ProvisioningStepInfo[]>([]);

  React.useEffect(() => {
    const prev = prevStepsRef.current;
    for (const step of steps) {
      const prevStep = prev.find((s) => s.name === step.name);
      if (prevStep?.status !== step.status) {
        if (step.status === 'complete') {
          setAnnouncement(`${step.label} completed.`);
        } else if (step.status === 'error') {
          setAnnouncement(`${step.label} failed: ${step.errorMessage ?? 'Unknown error'}`);
        } else if (step.status === 'in_progress') {
          setAnnouncement(`${step.label} in progress…`);
        }
      }
    }
    if (
      isSuccess &&
      !prev.some((s) => s.status === 'complete' && steps.every((st) => st.status === 'complete'))
    ) {
      setAnnouncement('Tenant provisioning complete!');
    }
    if (isError) {
      setAnnouncement(`Provisioning failed: ${errorMessage ?? 'Unknown error'}`);
    }
    prevStepsRef.current = steps;
  }, [steps, isSuccess, isError, errorMessage]);

  return (
    <div className={cn('space-y-4', className)}>
      {/* aria-live region — invisible but announces updates to screen readers */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>

      {/* Overall progress bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {isSuccess
              ? 'Provisioning complete'
              : isError
                ? 'Provisioning failed'
                : 'Provisioning…'}
          </span>
          {estimatedSecondsRemaining !== undefined && !isSuccess && !isError && (
            <span className="text-muted-foreground text-xs">
              ~{formatSeconds(estimatedSecondsRemaining)} remaining
            </span>
          )}
          <span className="text-muted-foreground text-xs">{Math.round(overallProgress)}%</span>
        </div>
        <Progress
          value={overallProgress}
          className={cn(isSuccess && '[&>div]:bg-green-600', isError && '[&>div]:bg-destructive')}
          aria-label={`Provisioning progress: ${Math.round(overallProgress)}%`}
        />
      </div>

      {/* Per-step list */}
      <ul className="space-y-2" role="list" aria-label="Provisioning steps">
        {steps.map((step) => (
          <li
            key={step.name}
            className={cn(
              'flex items-start gap-3 rounded-lg p-2 text-sm transition-colors',
              step.status === 'in_progress' && 'bg-primary/5',
              step.status === 'error' && 'bg-destructive/5',
              step.status === 'complete' && 'bg-green-50 dark:bg-green-950/20'
            )}
          >
            <StepIcon status={step.status} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'font-medium truncate',
                    step.status === 'complete' && 'text-green-700 dark:text-green-400',
                    step.status === 'error' && 'text-destructive',
                    step.status === 'in_progress' && 'text-primary',
                    (step.status === 'pending' || step.status === 'skipped') &&
                      'text-muted-foreground'
                  )}
                >
                  {step.label}
                </span>
                {step.retryAttempt !== undefined && step.retryAttempt > 0 && (
                  <span className="text-xs text-amber-600 font-medium shrink-0">
                    Retry {step.retryAttempt}/3
                  </span>
                )}
              </div>
              {step.status === 'error' && step.errorMessage && (
                <p className="text-xs text-destructive mt-0.5">{step.errorMessage}</p>
              )}
            </div>
          </li>
        ))}
      </ul>

      {/* Error state — retry button */}
      {isError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
          <p className="text-sm text-destructive font-medium">Provisioning failed</p>
          {errorMessage && <p className="text-xs text-destructive/80">{errorMessage}</p>}
          {onRetry && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRetry}
              type="button"
              className="border-destructive text-destructive hover:bg-destructive/10"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
              Retry provisioning
            </Button>
          )}
        </div>
      )}

      {/* Success state */}
      {isSuccess && (
        <div className="rounded-lg border border-green-300 bg-green-50 dark:bg-green-950/30 dark:border-green-800 p-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" aria-hidden="true" />
            <p className="text-sm text-green-700 dark:text-green-400 font-medium">
              Tenant successfully provisioned!
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
