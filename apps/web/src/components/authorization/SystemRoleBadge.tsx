// apps/web/src/components/authorization/SystemRoleBadge.tsx
//
// Phase 3b — Badge indicating a system-managed (immutable) role.
// Spec 003: Authorization System RBAC + ABAC
//
// WCAG 2.1 AA: lock icon is aria-hidden, text label carries the meaning.

import { Lock } from 'lucide-react';
import { Badge } from '@plexica/ui';

export interface SystemRoleBadgeProps {
  className?: string;
}

export function SystemRoleBadge({ className }: SystemRoleBadgeProps) {
  return (
    <Badge variant="secondary" className={className}>
      <Lock className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
      System
    </Badge>
  );
}
