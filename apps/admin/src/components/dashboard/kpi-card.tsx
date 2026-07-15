// kpi-card.tsx
// Single KPI card for the dashboard overview (design-spec Screen 2).
// Renders a <dl> with <dt> label + icon and <dd> value (+ optional subtext).
// Static (non-interactive) — WCAG 1.3.1 info & relationships via <dl>/<dt>/<dd>.

import type { LucideIcon } from 'lucide-react';

interface KpiCardProps {
  label: string;
  value: number | string;
  icon: LucideIcon;
  subtext?: string;
}

export function KpiCard({ label, value, icon: Icon, subtext }: KpiCardProps): JSX.Element {
  return (
    <dl className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
      <dt className="flex items-center gap-2 text-sm font-medium text-neutral-600">
        <Icon className="h-4 w-4" aria-hidden="true" />
        <span>{label}</span>
      </dt>
      <dd className="mt-2 text-2xl font-bold text-neutral-900">{value}</dd>
      {subtext !== undefined && (
        <dd className="mt-1 text-xs text-neutral-500">{subtext}</dd>
      )}
    </dl>
  );
}
