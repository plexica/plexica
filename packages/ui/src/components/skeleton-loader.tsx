// skeleton-loader.tsx
// Loading skeleton with pulse animation.
// Variants: text (h-4 w-3/4), card (h-24 w-full), circle (h-10 w-10).
// Pass className to override dimensions via tailwind-merge.
// Respects prefers-reduced-motion. Hidden from screen readers (aria-hidden).

import * as React from 'react';

import { cn } from '../lib/cn.js';

export type SkeletonVariant = 'text' | 'card' | 'circle';

export interface SkeletonLoaderProps {
  variant?: SkeletonVariant | undefined;
  className?: string | undefined;
}

const variantClasses: Record<SkeletonVariant, string> = {
  text:   'h-4 w-3/4 rounded',
  card:   'h-24 w-full rounded-lg',
  circle: 'h-10 w-10 rounded-full',
};

export function SkeletonLoader({
  variant = 'text',
  className,
}: SkeletonLoaderProps): React.JSX.Element {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'bg-neutral-200 animate-pulse motion-reduce:animate-none',
        variantClasses[variant],
        className,
      )}
    />
  );
}
