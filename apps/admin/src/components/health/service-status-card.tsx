// service-status-card.tsx
// ServiceHealthCard (design-spec Component 2) — renders one service's health
// status with icon + color + text (never color alone — WCAG 1.4.1).
// Rendered as a <figure> with <figcaption> per the design-spec a11y contract.

import { FormattedMessage } from 'react-intl';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';

import type { HealthStatusEnum } from '../../types/admin-types.js';

interface ServiceStatusCardProps {
  name: string;
  status: HealthStatusEnum;
  latencyMs: number;
}

const STATUS_STYLES: Record<
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

const STATUS_MESSAGE_ID: Record<HealthStatusEnum, string> = {
  healthy: 'admin.health.status.healthy',
  degraded: 'admin.health.status.degraded',
  down: 'admin.health.status.down',
};

export function ServiceStatusCard({ name, status, latencyMs }: ServiceStatusCardProps): JSX.Element {
  const style = STATUS_STYLES[status];
  const Icon = style.icon;
  const isAlert = status !== 'healthy';

  return (
    <figure
      className={`rounded-lg border ${style.borderClass} bg-white p-4 shadow-sm`}
      role={status === 'down' ? 'alert' : undefined}
      aria-live={isAlert ? 'polite' : undefined}
    >
      <figcaption className="text-sm font-semibold text-neutral-900">{name}</figcaption>
      <div className={`mt-2 flex items-center gap-2 ${style.textClass}`}>
        <Icon className="h-5 w-5" aria-hidden="true" />
        <span className="text-sm font-medium">
          <FormattedMessage id={STATUS_MESSAGE_ID[status]} />
        </span>
      </div>
      <dd className="mt-1 text-xs text-neutral-500">
        <FormattedMessage id="admin.health.latency" values={{ ms: latencyMs }} />
      </dd>
    </figure>
  );
}
