// toast.tsx — Toast notification component
// Variants: success, error, warning, info
// Auto-dismiss via duration prop (default 5000ms)
// WCAG 2.1 AA: role="alert", aria-live="polite"

import * as React from 'react';

import * as RadixToast from '@radix-ui/react-toast';
import { cva, type VariantProps } from 'class-variance-authority';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

import { cn } from '../lib/cn.js';

export const ToastProvider = RadixToast.Provider;
export const ToastViewport = React.forwardRef<
  React.ElementRef<typeof RadixToast.Viewport>,
  React.ComponentPropsWithoutRef<typeof RadixToast.Viewport>
>(({ className, ...props }, ref) => (
  <RadixToast.Viewport
    ref={ref}
    className={cn('fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-80', className)}
    {...props}
  />
));
ToastViewport.displayName = 'ToastViewport';

const toastVariants = cva(
  'flex items-start gap-3 rounded-lg border p-4 shadow-lg',
  {
    variants: {
      variant: {
        success: 'border-success bg-success-light text-success-dark',
        error:   'border-error   bg-error-light   text-error-dark',
        warning: 'border-warning bg-warning-light text-warning-dark',
        info:    'border-info    bg-info-light    text-info-dark',
      },
    },
    defaultVariants: { variant: 'info' },
  }
);

const ICONS = {
  success: CheckCircle2,
  error:   AlertCircle,
  warning: AlertTriangle,
  info:    Info,
} as const;

export interface ToastProps
  extends React.ComponentPropsWithoutRef<typeof RadixToast.Root>,
    VariantProps<typeof toastVariants> {
  title?: string;
  description?: string;
  /** Accessible label for the close button. Pass a localized string from the caller. */
  closeLabel?: string;
}

export const Toast = React.forwardRef<
  React.ElementRef<typeof RadixToast.Root>,
  ToastProps
>(({ className, variant = 'info', title, description, duration = 5000,
    closeLabel = 'Close notification', ...props }, ref) => {
  const Icon = ICONS[variant ?? 'info'];
  return (
    <RadixToast.Root
      ref={ref}
      duration={duration}
      className={cn(toastVariants({ variant }), className)}
      {...props}
    >
      <Icon className="h-5 w-5 shrink-0 mt-0.5" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        {title !== undefined && (
          <RadixToast.Title className="font-semibold text-sm">{title}</RadixToast.Title>
        )}
        {description !== undefined && (
          <RadixToast.Description className="text-sm opacity-90 mt-0.5">
            {description}
          </RadixToast.Description>
        )}
      </div>
      <RadixToast.Close className="shrink-0 opacity-70 hover:opacity-100" aria-label={closeLabel}>
        <X className="h-4 w-4" aria-hidden="true" />
      </RadixToast.Close>
    </RadixToast.Root>
  );
});
Toast.displayName = 'Toast';
