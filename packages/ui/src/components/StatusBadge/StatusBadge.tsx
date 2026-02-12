import * as React from 'react';
import { cn } from '@/lib/utils';
import { Badge, type BadgeProps } from '../Badge/Badge';

const STATUS_CONFIG = {
  active: { variant: 'success' as const, label: 'Active' },
  inactive: { variant: 'secondary' as const, label: 'Inactive' },
  suspended: { variant: 'danger' as const, label: 'Suspended' },
  draft: { variant: 'outline' as const, label: 'Draft' },
  published: { variant: 'success' as const, label: 'Published' },
  deprecated: { variant: 'warning' as const, label: 'Deprecated' },
  pending: { variant: 'warning' as const, label: 'Pending' },
  archived: { variant: 'secondary' as const, label: 'Archived' },
} as const;

export type StatusType = keyof typeof STATUS_CONFIG;

export interface StatusBadgeProps extends Omit<BadgeProps, 'variant'> {
  /** The status to display. */
  status: StatusType;
  /** Override the default label for the status. */
  label?: string;
}

const StatusBadge = React.forwardRef<HTMLDivElement, StatusBadgeProps>(
  ({ status, label, className, ...props }, ref) => {
    const config = STATUS_CONFIG[status];
    return (
      <Badge ref={ref} variant={config.variant} className={cn(className)} {...props}>
        {label ?? config.label}
      </Badge>
    );
  }
);
StatusBadge.displayName = 'StatusBadge';

export { StatusBadge, STATUS_CONFIG };
