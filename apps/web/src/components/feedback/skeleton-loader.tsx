// skeleton-loader.tsx
// Loading skeleton with pulse animation.
// Variants: text, card, circle.
// Respects prefers-reduced-motion. Hidden from screen readers.

type SkeletonVariant = 'text' | 'card' | 'circle';

interface SkeletonLoaderProps {
  variant?: SkeletonVariant;
  className?: string;
}

const variantClasses: Record<SkeletonVariant, string> = {
  text: 'h-4 w-3/4 rounded',
  card: 'h-24 w-full rounded-lg',
  circle: 'h-10 w-10 rounded-full',
};

export function SkeletonLoader({
  variant = 'text',
  className = '',
}: SkeletonLoaderProps): JSX.Element {
  return (
    <div
      aria-hidden="true"
      className={[
        'bg-neutral-200',
        'animate-pulse motion-reduce:animate-none',
        variantClasses[variant],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    />
  );
}
