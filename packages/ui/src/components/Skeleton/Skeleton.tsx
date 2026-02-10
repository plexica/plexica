import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const skeletonVariants = cva('animate-pulse bg-muted', {
  variants: {
    shape: {
      line: 'h-4 rounded',
      circle: 'rounded-full',
      rect: 'rounded-md',
    },
  },
  defaultVariants: {
    shape: 'line',
  },
});

export interface SkeletonProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof skeletonVariants> {
  /** Width of the skeleton. Accepts any CSS width value. */
  width?: string | number;
  /** Height of the skeleton. Accepts any CSS height value. */
  height?: string | number;
}

const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, shape, width, height, style, ...props }, ref) => {
    const sizeStyle: React.CSSProperties = {
      ...style,
      width: width != null ? (typeof width === 'number' ? `${width}px` : width) : undefined,
      height: height != null ? (typeof height === 'number' ? `${height}px` : height) : undefined,
    };

    // For circle shape, if width is set but height is not, make it square
    if (shape === 'circle' && width != null && height == null) {
      sizeStyle.height = sizeStyle.width;
    }

    return (
      <div
        ref={ref}
        className={cn(skeletonVariants({ shape }), className)}
        style={sizeStyle}
        {...props}
      />
    );
  }
);
Skeleton.displayName = 'Skeleton';

export { Skeleton, skeletonVariants };
