// apps/super-admin/src/components/plugins/InstallStep.tsx
//
// Individual install-step row for PluginInstallProgress (T004-29).
//
// Visual states (design-spec.md Screen 2):
//   pending  → ○  circle outline icon, muted text
//   running  → Spinner icon, normal text
//   complete → ✓  green CheckCircle icon, normal text + duration
//   failed   → ✕  red XCircle icon + inline error panel (role="alert")
//   skipped  → ○  circle outline icon + "(skipped)" muted label
//
// ARIA (design-spec.md Screen 2 Accessibility):
//   Each step row: role="listitem"
//   aria-label: "Step N name, status"
//   Data Migrations progress bar: role="progressbar" + aria-valuenow/max
//   Error panel: role="alert"

import { CheckCircle, XCircle, Circle } from 'lucide-react';
import { Spinner, Progress, Alert, AlertTitle, AlertDescription } from '@plexica/ui';
import type { InstallStepData } from '@/hooks/useInstallProgress';

// ---------------------------------------------------------------------------
// Helper: step icon
// ---------------------------------------------------------------------------

function StepIcon({ state }: { state: InstallStepData['state'] }) {
  switch (state) {
    case 'complete':
      return <CheckCircle className="h-4 w-4 text-green-600 shrink-0" aria-hidden="true" />;
    case 'failed':
      return <XCircle className="h-4 w-4 text-destructive shrink-0" aria-hidden="true" />;
    case 'running':
      return <Spinner size="sm" className="shrink-0 h-4 w-4" aria-hidden="true" />;
    default:
      // pending + skipped
      return <Circle className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />;
  }
}

// ---------------------------------------------------------------------------
// InstallStep
// ---------------------------------------------------------------------------

export interface InstallStepProps {
  step: InstallStepData;
}

export function InstallStep({ step }: InstallStepProps) {
  const {
    number,
    name,
    state,
    duration,
    detail,
    tenantRows,
    migrationProgress,
    errorMessage,
    errorSuggestion,
  } = step;

  const ariaLabel = `Step ${number} ${name}, ${state}`;

  return (
    <li
      role="listitem"
      aria-label={ariaLabel}
      className="py-3 border-b border-border last:border-0"
    >
      {/* Main step row */}
      <div className="flex items-start gap-3">
        <StepIcon state={state} />

        {/* Step number + name */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span
              className={`text-sm font-medium ${
                state === 'pending' || state === 'skipped'
                  ? 'text-muted-foreground'
                  : 'text-foreground'
              }`}
            >
              {number}. {name}
            </span>

            {/* Duration (complete) or "FAILED" badge or "(skipped)" */}
            <span className="text-xs text-muted-foreground shrink-0">
              {state === 'complete' && duration}
              {state === 'failed' && <span className="text-destructive font-semibold">FAILED</span>}
              {state === 'skipped' && '(skipped)'}
            </span>
          </div>

          {/* Detail text */}
          {detail && state !== 'failed' && (
            <p className="text-xs text-muted-foreground mt-0.5">{detail}</p>
          )}

          {/* Data Migrations progress bar (step 3, running state) */}
          {state === 'running' && migrationProgress !== undefined && (
            <div className="mt-2 space-y-1">
              <Progress
                value={migrationProgress}
                role="progressbar"
                aria-valuenow={migrationProgress}
                aria-valuemax={100}
                aria-label={`${name} progress`}
                className="h-2"
              />
              <p className="text-xs text-muted-foreground">{migrationProgress}% complete</p>
            </div>
          )}

          {/* Per-tenant migration sub-list */}
          {tenantRows && tenantRows.length > 0 && (
            <ul className="mt-2 space-y-1">
              {tenantRows.map((row) => (
                <li
                  key={row.tenantId}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground"
                >
                  {row.state === 'complete' ? (
                    <CheckCircle className="h-3 w-3 text-green-600 shrink-0" aria-hidden="true" />
                  ) : row.state === 'running' ? (
                    <Spinner size="sm" className="h-3 w-3 shrink-0" aria-hidden="true" />
                  ) : (
                    <Circle className="h-3 w-3 shrink-0" aria-hidden="true" />
                  )}
                  <span>
                    {row.tenantName}
                    {row.state === 'complete' && row.duration && ` (${row.duration})`}
                    {row.state === 'running' && ' (running...)'}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {/* Error panel (failed state) */}
          {state === 'failed' && errorMessage && (
            <Alert variant="destructive" role="alert" className="mt-2">
              <AlertTitle>Error: {errorMessage}</AlertTitle>
              {errorSuggestion && <AlertDescription>{errorSuggestion}</AlertDescription>}
            </Alert>
          )}
        </div>
      </div>
    </li>
  );
}
