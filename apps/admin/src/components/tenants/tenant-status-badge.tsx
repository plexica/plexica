// tenant-status-badge.tsx — Status badge for tenant lifecycle states.
// Icon + text + color (never color alone — WCAG 1.4.1).

import { FormattedMessage } from 'react-intl';
import { AlertTriangle, CheckCircle, Pause, XCircle, type LucideIcon } from 'lucide-react';

import { cn } from '@plexica/ui';

import type { TenantStatus } from '../../types/admin-types.js';

interface TenantStatusBadgeProps {
  status: TenantStatus;
}

interface StatusConfig {
  icon: LucideIcon;
  i18nKey: string;
  className: string;
}

const STATUS_CONFIG: Record<TenantStatus, StatusConfig> = {
  active: {
    icon: CheckCircle,
    i18nKey: 'tenants.status.active',
    className: 'bg-success-light text-success-dark',
  },
  suspended: {
    icon: Pause,
    i18nKey: 'tenants.status.suspended',
    className: 'bg-warning-light text-warning-dark',
  },
  pending_deletion: {
    icon: AlertTriangle,
    i18nKey: 'tenants.status.pending_deletion',
    className: 'bg-orange-100 text-orange-800',
  },
  deleted: {
    icon: XCircle,
    i18nKey: 'tenants.status.deleted',
    className: 'bg-neutral-100 text-neutral-500',
  },
};

export function TenantStatusBadge({ status }: TenantStatusBadgeProps): JSX.Element {
  const cfg = STATUS_CONFIG[status];
  if (cfg === undefined) return <span>{status}</span>;
  const Icon = cfg.icon;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
        cfg.className
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <FormattedMessage id={cfg.i18nKey} />
    </span>
  );
}
