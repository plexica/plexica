// quick-action-card.tsx
// Navigation card for the dashboard "Quick Actions" row (design-spec Screen 2).
// Renders as a TanStack Router <Link> (never a raw <a href> — Rule: one
// routing pattern). Arrow icon signals navigation affordance.

import { FormattedMessage } from 'react-intl';
import { Link } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';

import type { LucideIcon } from 'lucide-react';

interface QuickActionCardProps {
  to: string;
  labelId: string;
  icon: LucideIcon;
}

export function QuickActionCard({ to, labelId, icon: Icon }: QuickActionCardProps): JSX.Element {
  return (
    <Link
      to={to}
      className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-4 shadow-sm transition-colors hover:border-neutral-300 hover:bg-neutral-50"
    >
      <span className="flex items-center gap-2 text-sm font-medium text-neutral-900">
        <Icon className="h-4 w-4" aria-hidden="true" />
        <FormattedMessage id={labelId} />
      </span>
      <ArrowRight className="h-4 w-4 text-neutral-400" aria-hidden="true" />
    </Link>
  );
}
