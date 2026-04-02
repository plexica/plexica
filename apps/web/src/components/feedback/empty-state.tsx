// empty-state.tsx
// Generic empty state component with icon, heading, description, and optional CTA.
// role="status" to announce content to screen readers.

import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: string;
  heading: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ heading, description, action }: EmptyStateProps): JSX.Element {
  return (
    <div
      role="status"
      className="flex flex-col items-center justify-center rounded-lg border border-dashed border-neutral-200 bg-white px-6 py-12 text-center"
    >
      <p className="text-base font-medium text-neutral-700">{heading}</p>
      {description !== undefined && <p className="mt-1 text-sm text-neutral-500">{description}</p>}
      {action !== undefined && <div className="mt-4">{action}</div>}
    </div>
  );
}
