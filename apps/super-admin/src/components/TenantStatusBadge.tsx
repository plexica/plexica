// File: apps/super-admin/src/components/TenantStatusBadge.tsx
//
// Colored status badge for the 5 tenant lifecycle statuses.
// Design reference: Spec 008 Admin Interfaces — T008-44 Tenant List + Detail.
//
// Each status maps to a distinct Tailwind color pair so the badge is
// immediately scannable without a legend.  PROVISIONING shows a small
// spinner because the state is transient.

import React from 'react';
import { Spinner } from '@plexica/ui';
import type { TenantStatus } from '@/types';

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------

interface StatusConfig {
  label: string;
  /** Tailwind utility classes applied directly to the badge element. */
  colorClasses: string;
  /** Optional leading icon (aria-hidden so it is decorative). */
  icon?: React.ReactNode;
}

const STATUS_CONFIG: Record<TenantStatus, StatusConfig> = {
  ACTIVE: {
    label: 'Active',
    colorClasses: 'bg-green-100 text-green-800',
  },
  SUSPENDED: {
    label: 'Suspended',
    colorClasses: 'bg-amber-100 text-amber-800',
  },
  PROVISIONING: {
    label: 'Provisioning',
    colorClasses: 'bg-blue-100 text-blue-800',
    icon: <Spinner size="sm" className="h-3 w-3 mr-1 flex-shrink-0" aria-hidden="true" />,
  },
  PENDING_DELETION: {
    label: 'Pending Deletion',
    colorClasses: 'bg-red-100 text-red-800',
  },
  DELETED: {
    label: 'Deleted',
    colorClasses: 'bg-zinc-100 text-zinc-500',
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface TenantStatusBadgeProps {
  status: TenantStatus;
  className?: string;
}

export function TenantStatusBadge({ status, className }: TenantStatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG['ACTIVE'];

  return (
    <span
      role="status"
      aria-label={`Tenant status: ${status}`}
      className={[
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
        config.colorClasses,
        className ?? '',
      ]
        .join(' ')
        .trim()}
    >
      {config.icon}
      {config.label}
    </span>
  );
}
