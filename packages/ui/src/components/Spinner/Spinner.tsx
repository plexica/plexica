import * as React from 'react';
import { cn } from '@/lib/utils';

export interface SpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'md' | 'lg';
}

const Spinner = React.forwardRef<HTMLDivElement, SpinnerProps>(
  ({ className, size = 'md', ...props }, ref) => {
    const sizeClasses = {
      sm: 'h-4 w-4 border-2',
      md: 'h-8 w-8 border-2',
      lg: 'h-12 w-12 border-[3px]',
    };

    return (
      <div
        ref={ref}
        className={cn('inline-block', className)}
        role="status"
        aria-label="Loading"
        {...props}
      >
        <div
          className={cn(
            'animate-spin rounded-full border-primary border-t-transparent',
            sizeClasses[size]
          )}
        />
      </div>
    );
  }
);
Spinner.displayName = 'Spinner';

const PageSpinner = React.forwardRef<HTMLDivElement, Omit<SpinnerProps, 'size'>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex h-screen w-full items-center justify-center', className)}
      {...props}
    >
      <div className="text-center">
        <Spinner size="lg" className="mx-auto mb-4" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  )
);
PageSpinner.displayName = 'PageSpinner';

export { Spinner, PageSpinner };
