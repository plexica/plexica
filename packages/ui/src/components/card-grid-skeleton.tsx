// card-grid-skeleton.tsx
// Responsive grid of pulsing card placeholders shown while dashboard-style
// content loads. aria-busy + aria-label keep the loading state accessible;
// the label is passed by the caller (localized) — @plexica/ui must not depend
// on react-intl. Respects prefers-reduced-motion.

import * as React from 'react';

import { cn } from '../lib/cn.js';

export interface CardGridSkeletonProps {
  /** Number of placeholder cards. Default 6. */
  count?: number | undefined;
  /** Localized accessible label for the loading region. */
  ariaLabel?: string | undefined;
  /** Override card classes (default matches dashboard KPI card placeholders). */
  cardClassName?: string | undefined;
}

export function CardGridSkeleton({
  count = 6,
  ariaLabel,
  cardClassName,
}: CardGridSkeletonProps): React.JSX.Element {
  return (
    <div
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      aria-busy="true"
      aria-label={ariaLabel}
    >
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          aria-hidden="true"
          className={cn(
            'h-28 animate-pulse rounded-lg border border-neutral-200 bg-neutral-100 motion-reduce:animate-none',
            cardClassName,
          )}
        />
      ))}
    </div>
  );
}
