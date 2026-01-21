// File: packages/ui/src/components/Card/CardSkeleton.tsx

import * as React from 'react';
import { Card, CardContent } from './Card';

export interface CardSkeletonProps {
  className?: string;
}

/**
 * CardSkeleton component - A loading skeleton for Card components
 * Displays an animated placeholder while content is loading
 */
export const CardSkeleton = React.forwardRef<HTMLDivElement, CardSkeletonProps>(
  ({ className }, ref) => {
    return (
      <Card ref={ref} className={className}>
        <CardContent className="pt-6">
          <div className="animate-pulse space-y-3">
            {/* Title skeleton */}
            <div className="h-4 bg-background-secondary rounded w-1/3"></div>
            {/* Value skeleton */}
            <div className="h-8 bg-background-secondary rounded w-1/2"></div>
            {/* Footer skeleton */}
            <div className="h-3 bg-background-secondary rounded w-2/3"></div>
          </div>
        </CardContent>
      </Card>
    );
  }
);

CardSkeleton.displayName = 'CardSkeleton';
