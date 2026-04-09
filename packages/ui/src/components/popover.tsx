// popover.tsx — Popover primitives
// Built on @radix-ui/react-popover with consistent styling
// WCAG 2.1 AA: focus management handled by Radix

import * as React from 'react';
import * as RadixPopover from '@radix-ui/react-popover';

import { cn } from '../lib/cn.js';

export const PopoverRoot = RadixPopover.Root;
export const PopoverTrigger = RadixPopover.Trigger;
export const PopoverAnchor = RadixPopover.Anchor;

export const PopoverContent = React.forwardRef<
  React.ElementRef<typeof RadixPopover.Content>,
  React.ComponentPropsWithoutRef<typeof RadixPopover.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <RadixPopover.Portal>
    <RadixPopover.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-50 rounded-md border border-neutral-200 bg-white p-2 shadow-lg',
        'focus-visible:outline-none',
        'data-[state=open]:animate-in data-[state=closed]:animate-out',
        'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        className
      )}
      {...props}
    />
  </RadixPopover.Portal>
));

PopoverContent.displayName = 'PopoverContent';
