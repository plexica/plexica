// button.tsx — Button component
// Variants: primary, secondary, destructive, ghost, outline
// States: default, disabled (aria-disabled), loading (aria-busy)
// WCAG 2.1 AA: visible focus ring, keyboard accessible

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';

import { cn } from '../lib/cn.js';

const buttonVariants = cva(
  // Base styles: focus ring (WCAG), transitions, disabled state
  'inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium ' +
  'transition-colors focus-visible:outline-none focus-visible:ring-2 ' +
  'focus-visible:ring-primary-500 focus-visible:ring-offset-2 ' +
  'disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary:
          'bg-primary-600 text-white hover:bg-primary-700 active:bg-primary-800',
        secondary:
          'bg-neutral-100 text-neutral-900 hover:bg-neutral-200 active:bg-neutral-300',
        destructive:
          'bg-error text-white hover:bg-error-dark active:bg-error-dark',
        ghost:
          'hover:bg-neutral-100 text-neutral-700 active:bg-neutral-200',
        outline:
          'border border-neutral-300 bg-transparent text-neutral-700 ' +
          'hover:bg-neutral-50 active:bg-neutral-100',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-10 px-4',
        lg: 'h-11 px-6 text-base',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    const isDisabled = disabled === true || loading;

    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={isDisabled}
        aria-disabled={isDisabled}
        aria-busy={loading}
        {...props}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {children}
      </Comp>
    );
  }
);

Button.displayName = 'Button';
