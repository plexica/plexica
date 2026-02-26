// apps/super-admin/src/components/plugins/PluginStatusBadge.tsx
//
// Encapsulates the ADR-018 lifecycle status → Badge variant + color + icon mapping.
// Design reference: .forge/specs/004-plugin-system/design-spec.md Screen 1, badge table.

import React from 'react';
import { Pause } from 'lucide-react';
import { Badge } from '@plexica/ui';
import { Spinner } from '@plexica/ui';
import type { PluginLifecycleStatus } from '@plexica/types';

interface StatusConfig {
  variant: 'default' | 'secondary' | 'outline';
  colorClass: string;
  icon?: React.ReactNode;
  label: string;
}

const STATUS_CONFIG: Record<PluginLifecycleStatus, StatusConfig> = {
  REGISTERED: {
    variant: 'secondary',
    colorClass: 'text-muted-foreground',
    label: 'Registered',
  },
  INSTALLING: {
    variant: 'outline',
    colorClass: 'text-[var(--status-provisioning,theme(colors.blue.500))]',
    icon: <Spinner size="sm" className="mr-1 h-3 w-3" aria-hidden="true" />,
    label: 'Installing',
  },
  INSTALLED: {
    variant: 'outline',
    colorClass: 'text-[var(--status-info,theme(colors.sky.600))]',
    label: 'Installed',
  },
  ACTIVE: {
    variant: 'default',
    // LOW #15: use !text-[...] to override the variant's default foreground color
    // (variant="default" sets text-primary-foreground which can win the specificity race)
    colorClass: '!text-[var(--status-active,theme(colors.green.700))]',
    label: 'Active',
  },
  DISABLED: {
    variant: 'secondary',
    colorClass: 'text-[var(--status-warning,theme(colors.orange.600))]',
    icon: <Pause className="mr-1 h-3 w-3" aria-hidden="true" />,
    label: 'Disabled',
  },
  UNINSTALLING: {
    variant: 'outline',
    colorClass: 'text-[var(--status-provisioning,theme(colors.blue.500))]',
    icon: <Spinner size="sm" className="mr-1 h-3 w-3" aria-hidden="true" />,
    label: 'Uninstalling',
  },
  UNINSTALLED: {
    variant: 'secondary',
    colorClass: 'text-[var(--status-deleted,theme(colors.red.500))]',
    label: 'Uninstalled',
  },
};

export interface PluginStatusBadgeProps {
  status: PluginLifecycleStatus;
  className?: string;
}

export function PluginStatusBadge({ status, className }: PluginStatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG['REGISTERED'];

  return (
    <Badge variant={config.variant} className={`${config.colorClass} ${className ?? ''}`}>
      {config.icon}
      {config.label}
    </Badge>
  );
}
