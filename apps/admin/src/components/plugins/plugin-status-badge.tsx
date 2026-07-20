// plugin-status-badge.tsx — Status + review badges for plugin catalog rows.
// Icon + text + color (never color alone — WCAG 1.4.1).

import { FormattedMessage } from 'react-intl';
import {
  AlertTriangle,
  CheckCircle,
  Circle,
  Clock,
  FileEdit,
  PackageX,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@plexica/ui';

import type { PluginStatus, ReviewStatus } from '../../types/admin-types.js';

interface BadgeConfig {
  icon: LucideIcon;
  i18nKey: string;
  className: string;
}

const PLUGIN_STATUS: Record<PluginStatus, BadgeConfig> = {
  draft: { icon: FileEdit, i18nKey: 'plugins.status.draft', className: 'bg-neutral-100 text-neutral-700' },
  published: { icon: CheckCircle, i18nKey: 'plugins.status.published', className: 'bg-success-light text-success-dark' },
  unpublished: { icon: PackageX, i18nKey: 'plugins.status.unpublished', className: 'bg-neutral-100 text-neutral-500' },
  deprecated: { icon: AlertTriangle, i18nKey: 'plugins.status.deprecated', className: 'bg-warning-light text-warning-dark' },
};

const REVIEW_STATUS: Record<ReviewStatus, BadgeConfig> = {
  none: { icon: Circle, i18nKey: 'plugins.review.none', className: 'bg-neutral-100 text-neutral-500' },
  pending: { icon: Clock, i18nKey: 'plugins.review.pending', className: 'bg-warning-light text-warning-dark' },
  approved: { icon: CheckCircle, i18nKey: 'plugins.review.approved', className: 'bg-success-light text-success-dark' },
  rejected: { icon: XCircle, i18nKey: 'plugins.review.rejected', className: 'bg-error-light text-error-dark' },
};

function StatusBadge({ config }: { config: BadgeConfig }): JSX.Element {
  const Icon = config.icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
        config.className
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <FormattedMessage id={config.i18nKey} />
    </span>
  );
}

export function PluginStatusBadge({ status }: { status: PluginStatus }): JSX.Element {
  const config = PLUGIN_STATUS[status];
  if (config === undefined) return <span>{status}</span>;
  return <StatusBadge config={config} />;
}

export function ReviewStatusBadge({ status }: { status: ReviewStatus }): JSX.Element {
  const config = REVIEW_STATUS[status];
  if (config === undefined) return <span>{status}</span>;
  return <StatusBadge config={config} />;
}
