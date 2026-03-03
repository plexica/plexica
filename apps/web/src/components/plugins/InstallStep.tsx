// apps/web/src/components/plugins/InstallStep.tsx
//
// A single row in the PluginInstallProgress step list.
// Displays: step number, step name, status icon, optional elapsed duration.
//
// Status → icon mapping:
//   pending  → grey circle (Circle)
//   running  → animated Spinner
//   complete → green checkmark (CheckCircle2)
//   failed   → red X circle (XCircle)
//   skipped  → grey dash circle (MinusCircle)
//
// T004-29 — design-spec.md Screen 2

import { CheckCircle2, XCircle, Circle, MinusCircle } from 'lucide-react';
import { Spinner } from '@plexica/ui';
import { cn } from '@/lib/utils';
import type { StepStatus, TenantMigrationProgress } from '@/hooks/useInstallProgress';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InstallStepProps {
  /** 1-indexed step number */
  stepNumber: number;
  /** Human-readable step label */
  name: string;
  /** Current step status */
  status: StepStatus;
  /** Duration in seconds — shown when status is complete/failed */
  durationSeconds?: number;
  /** Per-tenant migration sub-list — only step 3 (Data Migrations) */
  tenantProgress?: TenantMigrationProgress[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(0).padStart(2, '0');
  return `${mins}m ${secs}s`;
}

function statusLabel(status: StepStatus): string {
  switch (status) {
    case 'pending':
      return 'pending';
    case 'running':
      return 'in progress';
    case 'complete':
      return 'complete';
    case 'failed':
      return 'failed';
    case 'skipped':
      return 'skipped';
  }
}

// ---------------------------------------------------------------------------
// Status icon
// ---------------------------------------------------------------------------

function StatusIcon({ status }: { status: StepStatus }) {
  switch (status) {
    case 'complete':
      return (
        <CheckCircle2
          className="h-5 w-5 shrink-0 text-green-500"
          aria-hidden="true"
          data-testid="step-icon-complete"
        />
      );
    case 'failed':
      return (
        <XCircle
          className="h-5 w-5 shrink-0 text-destructive"
          aria-hidden="true"
          data-testid="step-icon-failed"
        />
      );
    case 'running':
      return (
        <Spinner
          size="sm"
          className="shrink-0"
          aria-hidden="true"
          data-testid="step-icon-running"
        />
      );
    case 'skipped':
      return (
        <MinusCircle
          className="h-5 w-5 shrink-0 text-muted-foreground"
          aria-hidden="true"
          data-testid="step-icon-skipped"
        />
      );
    case 'pending':
    default:
      return (
        <Circle
          className="h-5 w-5 shrink-0 text-muted-foreground/40"
          aria-hidden="true"
          data-testid="step-icon-pending"
        />
      );
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function InstallStep({
  stepNumber,
  name,
  status,
  durationSeconds,
  tenantProgress,
}: InstallStepProps) {
  const ariaLabel = `Step ${stepNumber} ${name}, status: ${statusLabel(status)}`;

  const completedMigrations = tenantProgress?.filter((t) => t.complete).length ?? 0;
  const totalMigrations = tenantProgress?.length ?? 0;

  return (
    <li
      role="listitem"
      aria-label={ariaLabel}
      className={cn(
        'flex flex-col gap-1.5 rounded-md px-3 py-2.5 transition-colors',
        status === 'running' && 'bg-primary/5',
        status === 'complete' && 'opacity-80',
        status === 'skipped' && 'opacity-40'
      )}
    >
      {/* Main row */}
      <div className="flex items-center gap-3">
        {/* Step number badge */}
        <span
          className={cn(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
            status === 'complete' && 'bg-green-100 text-green-700',
            status === 'failed' && 'bg-destructive/10 text-destructive',
            status === 'running' && 'bg-primary/10 text-primary',
            (status === 'pending' || status === 'skipped') && 'bg-muted text-muted-foreground'
          )}
          aria-hidden="true"
        >
          {stepNumber}
        </span>

        {/* Step name */}
        <span
          className={cn(
            'flex-1 text-sm font-medium',
            status === 'pending' && 'text-muted-foreground',
            status === 'skipped' && 'text-muted-foreground line-through'
          )}
        >
          {name}
        </span>

        {/* Duration */}
        {durationSeconds !== undefined && (status === 'complete' || status === 'failed') && (
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {formatDuration(durationSeconds)}
          </span>
        )}

        {/* Status icon */}
        <StatusIcon status={status} />
      </div>

      {/* Tenant migration sub-list (step 3 only) */}
      {tenantProgress && tenantProgress.length > 0 && (
        <div className="ml-9 mt-1">
          {/* Progress bar */}
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {completedMigrations} / {totalMigrations} tenants migrated
            </span>
          </div>
          <div
            role="progressbar"
            aria-valuenow={completedMigrations}
            aria-valuemin={0}
            aria-valuemax={totalMigrations}
            aria-label={`${completedMigrations} of ${totalMigrations} tenant migrations complete`}
            className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full bg-primary transition-all"
              style={{
                width:
                  totalMigrations > 0
                    ? `${Math.round((completedMigrations / totalMigrations) * 100)}%`
                    : '0%',
              }}
            />
          </div>

          {/* Tenant list (max 5 shown) */}
          <ul className="mt-1.5 space-y-0.5">
            {tenantProgress.slice(0, 5).map((t) => (
              <li
                key={t.tenantId}
                className="flex items-center gap-1.5 text-xs text-muted-foreground"
              >
                {t.complete ? (
                  <CheckCircle2 className="h-3 w-3 text-green-500" aria-hidden="true" />
                ) : (
                  <Circle className="h-3 w-3 text-muted-foreground/40" aria-hidden="true" />
                )}
                <span>{t.tenantName}</span>
              </li>
            ))}
            {tenantProgress.length > 5 && (
              <li className="text-xs text-muted-foreground">+{tenantProgress.length - 5} more…</li>
            )}
          </ul>
        </div>
      )}
    </li>
  );
}
