// File: apps/super-admin/src/components/observability/HealthStatusBadge.tsx
//
// Renders a colour + icon + text badge for plugin health status.
// Uses BOTH colour AND text/icon to satisfy WCAG 1.4.1 (no colour-only info).
//
// Spec 012 — T012-29

import React from 'react';
import { CheckCircle, AlertTriangle, XCircle, HelpCircle } from 'lucide-react';
import type { PluginHealthStatus } from '@/api/observability';

export interface HealthStatusBadgeProps {
  status: PluginHealthStatus;
  /** Optional size override — defaults to 'md' */
  size?: 'sm' | 'md';
}

const STATUS_CONFIG: Record<
  PluginHealthStatus,
  { label: string; className: string; Icon: React.ElementType }
> = {
  healthy: { label: 'Healthy', className: 'bg-green-100 text-green-800', Icon: CheckCircle },
  degraded: { label: 'Degraded', className: 'bg-yellow-100 text-yellow-800', Icon: AlertTriangle },
  unreachable: { label: 'Unreachable', className: 'bg-red-100 text-red-800', Icon: XCircle },
  unknown: { label: 'Unknown', className: 'bg-gray-100 text-gray-700', Icon: HelpCircle },
};

export function HealthStatusBadge({ status, size = 'md' }: HealthStatusBadgeProps) {
  const { label, className, Icon } = STATUS_CONFIG[status] ?? STATUS_CONFIG.unknown;
  const iconSize = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4';
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm';

  return (
    <span
      className={[
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium',
        className,
        textSize,
      ].join(' ')}
      // Expose status as accessible text for screen readers
      aria-label={`Plugin status: ${label}`}
    >
      <Icon className={iconSize} aria-hidden="true" />
      {label}
    </span>
  );
}
