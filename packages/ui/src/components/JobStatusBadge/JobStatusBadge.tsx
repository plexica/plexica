// File: packages/ui/src/components/JobStatusBadge/JobStatusBadge.tsx
// T007-29 — Job status badge with icon + label for every JobStatus variant

import * as React from 'react';
import { CheckCircle, Clock, Loader2, StopCircle, XCircle, CalendarClock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge, type BadgeProps } from '../Badge/Badge';

// ---------------------------------------------------------------------------
// JobStatus enum (mirrors apps/core-api/src/types/core-services.types.ts)
// Duplicated here so the UI package has no backend dependency
// ---------------------------------------------------------------------------
export type JobStatusValue =
  | 'PENDING'
  | 'QUEUED'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'SCHEDULED';

interface JobStatusConfig {
  variant: BadgeProps['variant'];
  label: string;
  icon: React.ElementType;
}

const JOB_STATUS_CONFIG: Record<JobStatusValue, JobStatusConfig> = {
  PENDING: { variant: 'warning', label: 'Pending', icon: Clock },
  QUEUED: { variant: 'secondary', label: 'Queued', icon: StopCircle },
  RUNNING: { variant: 'default', label: 'Running', icon: Loader2 },
  COMPLETED: { variant: 'success', label: 'Completed', icon: CheckCircle },
  FAILED: { variant: 'danger', label: 'Failed', icon: XCircle },
  CANCELLED: { variant: 'secondary', label: 'Cancelled', icon: StopCircle },
  SCHEDULED: { variant: 'outline', label: 'Scheduled', icon: CalendarClock },
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
export interface JobStatusBadgeProps extends Omit<BadgeProps, 'variant'> {
  /** The job lifecycle status to display. */
  status: JobStatusValue;
  /** Override the default label. */
  label?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
const JobStatusBadge = React.forwardRef<HTMLDivElement, JobStatusBadgeProps>(
  ({ status, label, className, ...props }, ref) => {
    const config = JOB_STATUS_CONFIG[status] ?? JOB_STATUS_CONFIG.PENDING;
    const Icon = config.icon;

    return (
      <Badge ref={ref} variant={config.variant} className={cn('gap-1', className)} {...props}>
        <Icon
          className={cn('h-3 w-3', status === 'RUNNING' && 'animate-spin')}
          aria-hidden="true"
        />
        {label ?? config.label}
      </Badge>
    );
  }
);
JobStatusBadge.displayName = 'JobStatusBadge';

export { JobStatusBadge, JOB_STATUS_CONFIG };
