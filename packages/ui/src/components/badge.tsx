// badge.tsx — Badge component
// Colored pill badge for roles, statuses, etc.
// WCAG: uses sufficient color contrast per variant

import * as React from 'react';

import { cn } from '../lib/cn.js';

export type BadgeVariant =
  | 'admin'
  | 'member'
  | 'viewer'
  | 'pending'
  | 'success'
  | 'error'
  | 'default';

export interface BadgeProps {
  variant?: BadgeVariant;
  label: string;
  className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  admin:   'bg-primary-100 text-primary-800',
  member:  'bg-primary-50 text-primary-700',
  viewer:  'bg-neutral-100 text-neutral-700',
  pending: 'bg-warning-light text-warning-dark',
  success: 'bg-success-light text-success-dark',
  error:   'bg-error-light text-error-dark',
  default: 'bg-neutral-100 text-neutral-700',
};

export function Badge({ variant = 'default', label, className }: BadgeProps): React.JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        variantClasses[variant],
        className
      )}
    >
      {label}
    </span>
  );
}
