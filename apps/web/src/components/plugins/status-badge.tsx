// status-badge.tsx
// Reusable status badge for plugin installation status.

import { FormattedMessage } from 'react-intl';

import type { PluginInstallStatus } from '../../types/plugin.js';

interface StatusBadgeProps {
  status: PluginInstallStatus;
}

const STATUS_CONFIG: Record<
  PluginInstallStatus,
  { color: string; labelId: string }
> = {
  active: { color: 'bg-success-base/10 text-success-base', labelId: 'plugins.status.active' },
  degraded: {
    color: 'bg-warning-base/10 text-warning-base',
    labelId: 'plugins.status.degraded',
  },
  deactivated: {
    color: 'bg-neutral-100 text-neutral-500',
    labelId: 'plugins.status.deactivated',
  },
  installing: {
    color: 'bg-info-base/10 text-info-base',
    labelId: 'plugins.status.updating',
  },
  uninstalled: {
    color: 'bg-neutral-100 text-neutral-400',
    labelId: 'plugins.status.uninstalled',
  },
  failed: { color: 'bg-error-base/10 text-error-base', labelId: 'plugins.status.failed' },
};

export function StatusBadge({ status }: StatusBadgeProps): JSX.Element {
  const config = STATUS_CONFIG[status] ?? {
    color: 'bg-neutral-100 text-neutral-500',
    labelId: 'plugins.status.deactivated',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${config.color}`}
    >
      <FormattedMessage id={config.labelId} />
    </span>
  );
}
