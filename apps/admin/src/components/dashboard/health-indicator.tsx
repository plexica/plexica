// health-indicator.tsx
// Overall platform health badge for the dashboard (design-spec Screen 2).
// Renders the aggregate healthStatus from DashboardMetrics with icon + color +
// text (never color alone — WCAG 1.4.1). Reuses the admin.health.status.*
// i18n keys so labels stay consistent with the Health page.

import { FormattedMessage } from 'react-intl';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';

import type { HealthStatusEnum } from '../../types/admin-types.js';

interface HealthIndicatorProps {
  status: HealthStatusEnum;
}

const STATUS_STYLE: Record<
  HealthStatusEnum,
  { icon: typeof CheckCircle2; iconClass: string; textClass: string; borderClass: string }
> = {
  healthy: {
    icon: CheckCircle2,
    iconClass: 'text-green-600',
    textClass: 'text-green-700',
    borderClass: 'border-green-300',
  },
  degraded: {
    icon: AlertTriangle,
    iconClass: 'text-amber-600',
    textClass: 'text-amber-700',
    borderClass: 'border-amber-300',
  },
  down: {
    icon: XCircle,
    iconClass: 'text-red-600',
    textClass: 'text-red-700',
    borderClass: 'border-red-300',
  },
};

const STATUS_LABEL_ID: Record<HealthStatusEnum, string> = {
  healthy: 'admin.health.status.healthy',
  degraded: 'admin.health.status.degraded',
  down: 'admin.health.status.down',
};

export function HealthIndicator({ status }: HealthIndicatorProps): JSX.Element {
  const style = STATUS_STYLE[status];
  const Icon = style.icon;
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-md border ${style.borderClass} bg-white px-3 py-2 ${style.textClass}`}
      role={status === 'down' ? 'alert' : 'status'}
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
      <span className="text-sm font-semibold">
        <FormattedMessage id={STATUS_LABEL_ID[status]} />
      </span>
    </div>
  );
}
