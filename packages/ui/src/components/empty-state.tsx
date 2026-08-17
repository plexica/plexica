// empty-state.tsx
// Generic empty state component with icon, heading, description, and optional CTA.
// role="status" to announce content to screen readers.
// Strings arrive as ReactNode props — @plexica/ui must not depend on react-intl
// or on any app's message dictionaries.

import * as React from 'react';

import type { LucideIcon } from 'lucide-react';

export interface EmptyStateProps {
  icon?: LucideIcon | undefined;
  heading: React.ReactNode;
  description?: React.ReactNode | undefined;
  action?: React.ReactNode | undefined;
}

export function EmptyState({
  icon: Icon,
  heading,
  description,
  action,
}: EmptyStateProps): React.JSX.Element {
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
