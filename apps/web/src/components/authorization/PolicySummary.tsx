// apps/web/src/components/authorization/PolicySummary.tsx
//
// Phase 3b — Human-readable plain-English summary of a ConditionTree.
// Spec 003: Authorization System RBAC + ABAC

import type { ConditionTree } from '@/hooks/useAuthorizationApi';

export interface PolicySummaryProps {
  conditions: ConditionTree;
  className?: string;
}

// ---------------------------------------------------------------------------
// Recursive tree-to-text conversion
// ---------------------------------------------------------------------------

function summarizeTree(tree: ConditionTree): string {
  if ('all' in tree) {
    if (tree.all.length === 0) return '(empty)';
    return tree.all.map(summarizeTree).join(' and ');
  }
  if ('any' in tree) {
    if (tree.any.length === 0) return '(empty)';
    return tree.any.map(summarizeTree).join(' or ');
  }
  if ('not' in tree) {
    return `not (${summarizeTree(tree.not)})`;
  }
  // Leaf condition
  const leaf = tree as { attribute: string; operator: string; value: unknown };
  const valueStr = JSON.stringify(leaf.value);
  return `${leaf.attribute} ${leaf.operator} ${valueStr}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PolicySummary({ conditions, className }: PolicySummaryProps) {
  const summary = summarizeTree(conditions);

  return (
    <p
      className={['text-sm text-muted-foreground italic', className].filter(Boolean).join(' ')}
      aria-label="Policy condition summary"
    >
      {summary}
    </p>
  );
}
