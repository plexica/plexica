// tenant-status-chips.tsx
// Tenant status breakdown for the dashboard (design-spec Screen 2).
// Renders 4 labeled chips: active, suspended, pending_deletion, deleted.
// Deleted count is derived (tenantCount - active - suspended - pending) since
// the backend does not return it directly. Each chip has icon + text + count
// (never color alone — WCAG 1.4.1).

import { FormattedMessage } from 'react-intl';
import { AlertTriangle, CheckCircle2, Clock, Trash2 } from 'lucide-react';

import type { LucideIcon } from 'lucide-react';

interface TenantStatusChipsProps {
  active: number;
  suspended: number;
  pendingDeletion: number;
  deleted: number;
}

interface ChipDef {
  labelId: string;
  icon: LucideIcon;
  chipClass: string;
  count: number;
}

export function TenantStatusChips({
  active,
  suspended,
  pendingDeletion,
  deleted,
}: TenantStatusChipsProps): JSX.Element {
  const chips: ChipDef[] = [
    { labelId: 'dashboard.tenantStatus.active', icon: CheckCircle2, chipClass: 'bg-green-50 text-green-800 border-green-200', count: active },
    { labelId: 'dashboard.tenantStatus.suspended', icon: AlertTriangle, chipClass: 'bg-amber-50 text-amber-800 border-amber-200', count: suspended },
    { labelId: 'dashboard.tenantStatus.pendingDeletion', icon: Clock, chipClass: 'bg-orange-50 text-orange-800 border-orange-200', count: pendingDeletion },
    { labelId: 'dashboard.tenantStatus.deleted', icon: Trash2, chipClass: 'bg-neutral-100 text-neutral-700 border-neutral-200', count: deleted },
  ];

  return (
    <ul className="flex flex-wrap gap-2">
      {chips.map((chip) => {
        const Icon = chip.icon;
        return (
          <li
            key={chip.labelId}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium ${chip.chipClass}`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            <FormattedMessage id={chip.labelId} />
            <span className="font-bold">{chip.count}</span>
          </li>
        );
      })}
    </ul>
  );
}
