// apps/web/src/components/authorization/NotGroup.tsx
//
// Phase 3b — Wraps a single child condition in a NOT (negation) wrapper.
// Spec 003: Authorization System RBAC + ABAC

import { Badge } from '@plexica/ui';
import type { ConditionTree } from '@/hooks/useAuthorizationApi';

export interface NotGroupProps {
  child: ConditionTree;
  onChange: (t: ConditionTree) => void;
  disabled?: boolean;
  // Render children — passed by ConditionBuilder recursively
  renderChild: (tree: ConditionTree, onChildChange: (t: ConditionTree) => void) => React.ReactNode;
}

import type React from 'react';

export function NotGroup({ child, onChange, renderChild }: NotGroupProps) {
  return (
    <div className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="text-xs font-mono">
          NOT
        </Badge>
        <span className="text-xs text-muted-foreground">
          Negation — the condition below must NOT be true
        </span>
      </div>
      <div className="pl-4">{renderChild(child, onChange)}</div>
    </div>
  );
}
