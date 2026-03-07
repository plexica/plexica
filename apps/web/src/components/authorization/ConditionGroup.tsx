// apps/web/src/components/authorization/ConditionGroup.tsx
//
// Phase 3b — AND/OR combinator wrapper for a group of conditions.
// Spec 003: Authorization System RBAC + ABAC

import React from 'react';
import { Button } from '@plexica/ui';
import { Plus, Layers } from 'lucide-react';
import type { ConditionTree } from '@/hooks/useAuthorizationApi';
import type { LeafConditionData } from './ConditionRow';

const MAX_CONDITIONS = 20;
const MAX_DEPTH = 5;

export interface ConditionGroupProps {
  combinator: 'AND' | 'OR';
  conditions: ConditionTree[];
  onChange: (cs: ConditionTree[]) => void;
  onChangeCombinator: (c: 'AND' | 'OR') => void;
  depth: number;
  disabled?: boolean;
  totalConditionCount: number;
  // Recursive render function injected by ConditionBuilder
  renderCondition: (
    tree: ConditionTree,
    index: number,
    onUpdate: (updated: ConditionTree) => void,
    onRemove: () => void
  ) => React.ReactNode;
}

export function ConditionGroup({
  combinator,
  conditions,
  onChange,
  onChangeCombinator,
  depth,
  disabled = false,
  totalConditionCount,
  renderCondition,
}: ConditionGroupProps) {
  const canAddMore = totalConditionCount < MAX_CONDITIONS;
  const canAddGroup = depth < MAX_DEPTH && canAddMore;

  function addLeaf() {
    if (!canAddMore) return;
    const leaf: LeafConditionData = { attribute: '', operator: 'equals', value: '' };
    onChange([...conditions, leaf as unknown as ConditionTree]);
  }

  function addGroup() {
    if (!canAddGroup) return;
    const group: ConditionTree = { all: [] };
    onChange([...conditions, group]);
  }

  function update(index: number, updated: ConditionTree) {
    const next = [...conditions];
    next[index] = updated;
    onChange(next);
  }

  function remove(index: number) {
    onChange(conditions.filter((_, i) => i !== index));
  }

  const indentClass = depth > 0 ? 'ml-4 border-l-2 border-muted pl-3' : '';

  return (
    <div className={`space-y-2 ${indentClass}`}>
      {/* Combinator toggle */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={[
            'px-2 py-0.5 text-xs font-mono rounded border transition-colors',
            combinator === 'AND'
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-background text-muted-foreground border-border hover:bg-muted',
          ].join(' ')}
          onClick={() => onChangeCombinator('AND')}
          disabled={disabled}
          aria-pressed={combinator === 'AND'}
          aria-label="AND combinator"
        >
          AND
        </button>
        <button
          type="button"
          className={[
            'px-2 py-0.5 text-xs font-mono rounded border transition-colors',
            combinator === 'OR'
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-background text-muted-foreground border-border hover:bg-muted',
          ].join(' ')}
          onClick={() => onChangeCombinator('OR')}
          disabled={disabled}
          aria-pressed={combinator === 'OR'}
          aria-label="OR combinator"
        >
          OR
        </button>
        <span className="text-xs text-muted-foreground">
          {combinator === 'AND' ? 'All conditions must match' : 'Any condition must match'}
        </span>
      </div>

      {/* Condition list */}
      <div className="space-y-1.5">
        {conditions.map((cond, idx) =>
          renderCondition(
            cond,
            idx,
            (updated) => update(idx, updated),
            () => remove(idx)
          )
        )}
      </div>

      {/* Add buttons */}
      <div className="flex items-center gap-2 pt-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addLeaf}
          disabled={disabled || !canAddMore}
          aria-label="Add condition"
        >
          <Plus className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
          Add Condition
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addGroup}
          disabled={disabled || !canAddGroup}
          aria-label="Add group"
        >
          <Layers className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
          Add Group
        </Button>
      </div>
    </div>
  );
}
