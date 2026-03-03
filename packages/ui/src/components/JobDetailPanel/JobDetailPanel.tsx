// File: packages/ui/src/components/JobDetailPanel/JobDetailPanel.tsx
// T007-28 — Expandable job detail panel with retry / disable-schedule actions

import * as React from 'react';
import { ChevronDown, ChevronUp, RefreshCw, CalendarOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '../Button/Button';
import { JobStatusBadge, type JobStatusValue } from '../JobStatusBadge/JobStatusBadge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface JobDetails {
  id: string;
  name: string;
  status: JobStatusValue;
  payload?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
  retries?: number;
  maxRetries?: number;
  cronExpression?: string;
  scheduledAt?: Date | string;
  startedAt?: Date | string;
  completedAt?: Date | string;
  createdAt?: Date | string;
}

export interface JobDetailPanelProps {
  /** The job to display. */
  job: JobDetails;
  /** Called when user clicks "Retry Now" (only shown for FAILED jobs). */
  onRetry?: (job: JobDetails) => void;
  /** Called when user clicks "Disable Schedule" (only shown for SCHEDULED jobs). */
  onDisableSchedule?: (job: JobDetails) => void;
  /** Control external expanded state. */
  expanded?: boolean;
  /** Called when the expand/collapse toggle is clicked. */
  onExpandedChange?: (expanded: boolean) => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatDateTime(value: Date | string | undefined): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(value));
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4 py-1.5">
      <dt className="w-36 shrink-0 text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="flex-1 text-xs text-foreground break-all">{value ?? '—'}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
const JobDetailPanel = React.forwardRef<HTMLDivElement, JobDetailPanelProps>(
  (
    { job, onRetry, onDisableSchedule, expanded: controlledExpanded, onExpandedChange, className },
    ref
  ) => {
    const [internalExpanded, setInternalExpanded] = React.useState(false);
    const isControlled = controlledExpanded !== undefined;
    const isExpanded = isControlled ? controlledExpanded : internalExpanded;
    const panelId = `job-panel-${job.id}`;
    const headerId = `job-header-${job.id}`;

    const handleToggle = () => {
      const next = !isExpanded;
      if (!isControlled) setInternalExpanded(next);
      onExpandedChange?.(next);
    };

    return (
      <div ref={ref} className={cn('rounded-lg border border-border bg-card', className)}>
        {/* Header / trigger */}
        <button
          id={headerId}
          className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-muted/50 transition-colors rounded-lg"
          onClick={handleToggle}
          aria-expanded={isExpanded}
          aria-controls={panelId}
        >
          <div className="flex items-center gap-3 min-w-0">
            <JobStatusBadge status={job.status} />
            <span className="truncate text-sm font-medium text-foreground">{job.name}</span>
            <span className="hidden text-xs text-muted-foreground sm:inline">
              #{job.id.slice(0, 8)}
            </span>
          </div>
          <div className="ml-2 shrink-0">
            {isExpanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            )}
          </div>
        </button>

        {/* Expanded detail region */}
        {isExpanded && (
          <div
            id={panelId}
            role="region"
            aria-labelledby={headerId}
            className="border-t border-border px-4 py-3"
          >
            <dl className="divide-y divide-border">
              <DetailRow label="Job ID" value={<code className="font-mono">{job.id}</code>} />
              <DetailRow label="Name" value={job.name} />
              <DetailRow label="Status" value={<JobStatusBadge status={job.status} />} />
              {job.cronExpression && (
                <DetailRow
                  label="Cron"
                  value={<code className="font-mono">{job.cronExpression}</code>}
                />
              )}
              <DetailRow label="Retries" value={`${job.retries ?? 0} / ${job.maxRetries ?? 3}`} />
              <DetailRow label="Scheduled At" value={formatDateTime(job.scheduledAt)} />
              <DetailRow label="Started At" value={formatDateTime(job.startedAt)} />
              <DetailRow label="Completed At" value={formatDateTime(job.completedAt)} />
              <DetailRow label="Created At" value={formatDateTime(job.createdAt)} />
              {job.error && (
                <DetailRow
                  label="Error"
                  value={<span className="text-destructive">{job.error}</span>}
                />
              )}
              {job.payload && (
                <DetailRow
                  label="Payload"
                  value={
                    <pre className="whitespace-pre-wrap rounded bg-muted p-2 font-mono text-xs">
                      {JSON.stringify(job.payload, null, 2)}
                    </pre>
                  }
                />
              )}
              {job.result && (
                <DetailRow
                  label="Result"
                  value={
                    <pre className="whitespace-pre-wrap rounded bg-muted p-2 font-mono text-xs">
                      {JSON.stringify(job.result, null, 2)}
                    </pre>
                  }
                />
              )}
            </dl>

            {/* Actions */}
            {(job.status === 'FAILED' || job.status === 'SCHEDULED') && (
              <div className="mt-3 flex gap-2">
                {job.status === 'FAILED' && onRetry && (
                  <Button size="sm" variant="outline" onClick={() => onRetry(job)}>
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                    Retry Now
                  </Button>
                )}
                {job.status === 'SCHEDULED' && onDisableSchedule && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onDisableSchedule(job)}
                    className="text-destructive hover:text-destructive"
                  >
                    <CalendarOff className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                    Disable Schedule
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }
);
JobDetailPanel.displayName = 'JobDetailPanel';

export { JobDetailPanel };
