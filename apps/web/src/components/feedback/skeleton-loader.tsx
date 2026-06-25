// skeleton-loader.tsx
// Loading skeleton with pulse animation.
// Variants: text (h-4 w-3/4), card (h-24 w-full), circle (h-10 w-10).
// Pass className to override dimensions via tailwind-merge.
// Respects prefers-reduced-motion. Hidden from screen readers (aria-hidden).

import { cn } from '@plexica/ui';

type SkeletonVariant = 'text' | 'card' | 'circle';

interface SkeletonLoaderProps {
  variant?: SkeletonVariant;
  className?: string;
}

const variantClasses: Record<SkeletonVariant, string> = {
  text:   'h-4 w-3/4 rounded',
  card:   'h-24 w-full rounded-lg',
  circle: 'h-10 w-10 rounded-full',
};

export function SkeletonLoader({
  variant = 'text',
  className,
}: SkeletonLoaderProps): JSX.Element {
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
