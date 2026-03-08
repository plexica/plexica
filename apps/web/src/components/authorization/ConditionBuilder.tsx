// apps/web/src/components/authorization/ConditionBuilder.tsx
//
// Phase 3b — Entry-point component for building ConditionTree values.
// Recursively renders ConditionGroup/ConditionRow/NotGroup.
// Feature-flag gated via `enabled` prop (derived from PolicyPage.meta.featureEnabled).
//
// Limits: max 20 conditions total, max depth 5.
// Spec 003: Authorization System RBAC + ABAC

import React from 'react';
import type { ConditionTree } from '@/hooks/useAuthorizationApi';
import { ConditionGroup } from './ConditionGroup';
import { ConditionRow, type LeafConditionData } from './ConditionRow';
import { NotGroup } from './NotGroup';

const MAX_CONDITIONS = 20;
const MAX_DEPTH = 5;

export interface ConditionBuilderProps {
  value: ConditionTree;
  onChange: (tree: ConditionTree) => void;
  disabled?: boolean;
  /** Whether ABAC is enabled for this tenant. When false, shows an info banner. */
  enabled?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isLeaf(tree: ConditionTree): tree is LeafConditionData & ConditionTree {
  return 'attribute' in tree;
}

function countConditions(tree: ConditionTree): number {
  if ('all' in tree) {
    return tree.all.reduce((sum, c) => sum + countConditions(c), 0);
  }
  if ('any' in tree) {
    return tree.any.reduce((sum, c) => sum + countConditions(c), 0);
  }
  if ('not' in tree) {
    return countConditions(tree.not);
  }
  // Leaf
  return 1;
}

function getDepth(tree: ConditionTree, currentDepth = 0): number {
  if ('all' in tree) {
    if (tree.all.length === 0) return currentDepth;
    return Math.max(...tree.all.map((c) => getDepth(c, currentDepth + 1)));
  }
  if ('any' in tree) {
    if (tree.any.length === 0) return currentDepth;
    return Math.max(...tree.any.map((c) => getDepth(c, currentDepth + 1)));
  }
  if ('not' in tree) {
    return getDepth(tree.not, currentDepth + 1);
  }
  return currentDepth;
}

// ---------------------------------------------------------------------------
// Recursive renderer
// ---------------------------------------------------------------------------

interface RenderNodeOptions {
  depth: number;
  totalConditions: number;
  disabled: boolean;
  onUpdate: (updated: ConditionTree) => void;
  onRemove: () => void;
}

function RenderNode({
  tree,
  depth,
  totalConditions,
  disabled,
  onUpdate,
  onRemove,
}: { tree: ConditionTree } & RenderNodeOptions): React.ReactElement {
  // Leaf condition
  if (isLeaf(tree)) {
    const leaf = tree as unknown as LeafConditionData;
    return (
      <ConditionRow
        condition={leaf}
        onChange={(updated) => onUpdate(updated as unknown as ConditionTree)}
        onRemove={onRemove}
        disabled={disabled}
      />
    );
  }

  // NOT wrapper
  if ('not' in tree) {
    return (
      <NotGroup
        child={tree.not}
        onChange={(updated) => onUpdate({ not: updated })}
        disabled={disabled}
        renderChild={(child, onChildChange) => (
          <RenderNode
            tree={child}
            depth={depth + 1}
            totalConditions={totalConditions}
            disabled={disabled}
            onUpdate={onChildChange}
            onRemove={() => onUpdate({ all: [] })}
          />
        )}
      />
    );
  }

  // AND or OR group
  const isAll = 'all' in tree;
  const children = isAll ? tree.all : (tree as { any: ConditionTree[] }).any;
  const combinator: 'AND' | 'OR' = isAll ? 'AND' : 'OR';

  return (
    <ConditionGroup
      combinator={combinator}
      conditions={children}
      depth={depth}
      disabled={disabled}
      totalConditionCount={totalConditions}
      onChangeCombinator={(c) => {
        onUpdate(c === 'AND' ? { all: children } : { any: children });
      }}
      onChange={(updated) => {
        onUpdate(isAll ? { all: updated } : { any: updated });
      }}
      renderCondition={(child, _idx, onChildUpdate, onChildRemove) => (
        <RenderNode
          key={_idx}
          tree={child}
          depth={depth + 1}
          totalConditions={totalConditions}
          disabled={disabled}
          onUpdate={onChildUpdate}
          onRemove={onChildRemove}
        />
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// ConditionBuilder entry point
// ---------------------------------------------------------------------------

export function ConditionBuilder({
  value,
  onChange,
  disabled = false,
  enabled = true,
}: ConditionBuilderProps) {
  if (!enabled) {
    return (
      <div className="rounded-lg border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
        Attribute-based conditions are not available for this tenant.
      </div>
    );
  }

  const totalConditions = countConditions(value);
  const currentDepth = getDepth(value);

  return (
    <div className="space-y-3">
      <RenderNode
        tree={value}
        depth={0}
        totalConditions={totalConditions}
        disabled={disabled || totalConditions >= MAX_CONDITIONS}
        onUpdate={onChange}
        onRemove={() => onChange({ all: [] })}
      />
      {(totalConditions >= MAX_CONDITIONS || currentDepth >= MAX_DEPTH) && (
        <p className="text-xs text-destructive">
          {totalConditions >= MAX_CONDITIONS
            ? `Maximum of ${MAX_CONDITIONS} conditions reached.`
            : `Maximum nesting depth of ${MAX_DEPTH} reached.`}
        </p>
      )}
    </div>
  );
}
