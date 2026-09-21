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
        primary: 'bg-primary-600 text-white hover:bg-primary-700 active:bg-primary-800',
        secondary: 'bg-neutral-100 text-neutral-900 hover:bg-neutral-200 active:bg-neutral-300',
        destructive: 'bg-error text-white hover:bg-error-dark active:bg-error-dark',
        ghost: 'hover:bg-neutral-100 text-neutral-700 active:bg-neutral-200',
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
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, asChild = false, loading = false, disabled, children, ...props },
    ref
  ) => {
    const isDisabled = disabled === true || loading;

    if (asChild) {
      // asChild (Radix Slot): the slot MUST receive exactly one element child.
      // Injecting the Loader2 sibling (as the plain-button path does) makes
      // Slot receive an array, which fails React.isValidElement and throws
      // "Expected a single React element child or `Slottable`" — crashing every
      // asChild Button. The loader is inapplicable to non-button children, and
      // `disabled` (button-only) is intentionally omitted: disabled state is
      // conveyed via aria-disabled (valid on any element).
      //
      // Disabled activation guard: a native <button disabled> cannot be
      // activated (click/keyboard), but a slot non-button child (e.g. a router
      // Link anchor) has NO native disabled — without a guard a "disabled"
      // asChild anchor still navigates and its onClick still fires. Radix Slot
      // merges every prop onto the single child element, so the capture-phase
      // onClickCapture below runs BEFORE the child's own bubble-phase onClick
      // on the same element: preventDefault() blocks native navigation (anchor
      // href / form submit) and stopPropagation() suppresses the child's onClick
      // entirely. tabIndex={-1} also removes the disabled child from the tab
      // order (its native focusability cannot be switched off).
      return (
        <Slot
          ref={ref}
          className={cn(buttonVariants({ variant, size }), className)}
          aria-disabled={isDisabled}
          aria-busy={loading}
          tabIndex={isDisabled ? -1 : undefined}
          {...props}
          {...(isDisabled
            ? {
                onClickCapture: (event: React.MouseEvent<HTMLElement>) => {
                  event.preventDefault();
                  event.stopPropagation();
                },
              }
            : {})}
        >
          {children}
        </Slot>
      );
    }

    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={isDisabled}
        aria-disabled={isDisabled}
        aria-busy={loading}
        {...props}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
