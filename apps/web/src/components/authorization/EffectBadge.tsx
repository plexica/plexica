// apps/web/src/components/authorization/EffectBadge.tsx
//
// Phase 3b — Badge showing policy effect (DENY / FILTER).
// Spec 003: Authorization System RBAC + ABAC

import { Badge } from '@plexica/ui';

export interface EffectBadgeProps {
  effect: 'DENY' | 'FILTER';
  className?: string;
}

export function EffectBadge({ effect, className }: EffectBadgeProps) {
  if (effect === 'DENY') {
    return (
      <Badge variant="danger" className={className}>
        DENY
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className={['text-blue-600 border-blue-600', className].filter(Boolean).join(' ')}
    >
      FILTER
    </Badge>
  );
}
