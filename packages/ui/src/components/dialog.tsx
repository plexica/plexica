// dialog.tsx — Dialog (modal) component
// Built on Radix UI Dialog primitive (handles focus trap + ESC key natively)
// WCAG 2.1 AA: focus trap, aria-modal, aria-labelledby

import * as React from 'react';

import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

import { cn } from '../lib/cn.js';

export const DialogRoot = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;
export const DialogPortal = RadixDialog.Portal;
export const DialogClose = RadixDialog.Close;

export const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof RadixDialog.Overlay>,
  React.ComponentPropsWithoutRef<typeof RadixDialog.Overlay>
>(({ className, ...props }, ref) => (
  <RadixDialog.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/60 backdrop-blur-sm',
      'data-[state=open]:animate-in data-[state=closed]:animate-out',
      'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className
    )}
    {...props}
  />
));
DialogOverlay.displayName = 'DialogOverlay';

export const DialogContent = React.forwardRef<
  React.ElementRef<typeof RadixDialog.Content>,
  React.ComponentPropsWithoutRef<typeof RadixDialog.Content> & {
    /** Accessible label for the close button. Pass a localized string from the caller. */
    closeLabel?: string;
  }
>(({ className, children, closeLabel = 'Close', ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <RadixDialog.Content
      ref={ref}
      className={cn(
        'fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2',
        'w-full max-w-lg rounded-lg bg-white p-6 shadow-xl',
        'data-[state=open]:animate-in data-[state=closed]:animate-out',
        'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        className
      )}
      {...props}
    >
      {children}
      <DialogClose className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-primary-500">
        <X className="h-4 w-4" aria-hidden="true" />
        <span className="sr-only">{closeLabel}</span>
      </DialogClose>
    </RadixDialog.Content>
  </DialogPortal>
));
DialogContent.displayName = 'DialogContent';

export const DialogTitle = React.forwardRef<
  React.ElementRef<typeof RadixDialog.Title>,
  React.ComponentPropsWithoutRef<typeof RadixDialog.Title>
>(({ className, ...props }, ref) => (
  <RadixDialog.Title
    ref={ref}
    className={cn('text-lg font-semibold text-neutral-900', className)}
    {...props}
  />
));
DialogTitle.displayName = 'DialogTitle';

export const DialogDescription = React.forwardRef<
  React.ElementRef<typeof RadixDialog.Description>,
  React.ComponentPropsWithoutRef<typeof RadixDialog.Description>
>(({ className, ...props }, ref) => (
  <RadixDialog.Description
    ref={ref}
    className={cn('mt-2 text-sm text-neutral-600', className)}
    {...props}
  />
));
DialogDescription.displayName = 'DialogDescription';
