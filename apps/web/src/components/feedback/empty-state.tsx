// empty-state.tsx
// Generic empty state component with icon, heading, description, and optional CTA.
// role="status" to announce content to screen readers.
// L-01 fix: icon prop is now rendered (was declared but silently ignored).
// Icon type changed from string to LucideIcon — callers must pass the component.

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: LucideIcon;
  heading: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({
  icon: Icon,
  heading,
  description,
  action,
}: EmptyStateProps): JSX.Element {
  return (
    <div
      role="status"
      className="flex flex-col items-center justify-center rounded-lg border border-dashed border-neutral-200 bg-white px-6 py-12 text-center"
    >
      {Icon !== undefined && <Icon className="mb-4 h-8 w-8 text-neutral-400" aria-hidden="true" />}
      <p className="text-base font-medium text-neutral-700">{heading}</p>
      {description !== undefined && <p className="mt-1 text-sm text-neutral-500">{description}</p>}
      {action !== undefined && <div className="mt-4">{action}</div>}
    </div>
  );
}
