// apps/web/src/components/authorization/ConditionLimitIndicator.tsx
//
// Phase 3b — Shows live condition count and depth limits.
// Text turns red when limits are reached.
// Spec 003: Authorization System RBAC + ABAC

export interface ConditionLimitIndicatorProps {
  conditionCount: number;
  depth: number;
}

const MAX_CONDITIONS = 20;
const MAX_DEPTH = 5;

export function ConditionLimitIndicator({ conditionCount, depth }: ConditionLimitIndicatorProps) {
  const conditionAtLimit = conditionCount >= MAX_CONDITIONS;
  const depthAtLimit = depth >= MAX_DEPTH;

  return (
    <div className="flex items-center gap-4 text-xs text-muted-foreground">
      <span className={conditionAtLimit ? 'text-destructive font-medium' : ''}>
        {conditionCount} / {MAX_CONDITIONS} conditions
      </span>
      <span className={depthAtLimit ? 'text-destructive font-medium' : ''}>
        Depth: {depth} / {MAX_DEPTH}
      </span>
    </div>
  );
}
