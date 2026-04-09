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
  admin: 'bg-indigo-100 text-indigo-800',
  member: 'bg-blue-100 text-blue-800',
  viewer: 'bg-neutral-100 text-neutral-700',
  pending: 'bg-yellow-100 text-yellow-800',
  success: 'bg-green-100 text-green-800',
  error: 'bg-red-100 text-red-800',
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
