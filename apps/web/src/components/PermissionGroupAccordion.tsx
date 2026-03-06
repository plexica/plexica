// File: apps/web/src/components/PermissionGroupAccordion.tsx
//
// T008-54 — Accordion component that renders permissions grouped by plugin/source.
// Used by the Role Editor to display and select permissions.
// Spec 008 Admin Interfaces — Tenant Admin Phase 7

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Checkbox } from '@plexica/ui';
import { Badge } from '@plexica/ui';
import type { PermissionGroup, Permission } from '@/api/admin';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PermissionGroupAccordionProps {
  groups: PermissionGroup[];
  selected: Set<string>;
  onChange: (selected: Set<string>) => void;
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Single group panel
// ---------------------------------------------------------------------------

interface GroupPanelProps {
  group: PermissionGroup;
  selected: Set<string>;
  onChange: (selected: Set<string>) => void;
  disabled: boolean;
}

function GroupPanel({ group, selected, onChange, disabled }: GroupPanelProps) {
  const [open, setOpen] = useState(false);

  const groupIds = group.permissions.map((p) => p.id);
  const selectedCount = groupIds.filter((id) => selected.has(id)).length;
  const allSelected = selectedCount === groupIds.length;
  const someSelected = selectedCount > 0 && !allSelected;

  function toggleAll() {
    const next = new Set(selected);
    if (allSelected) {
      groupIds.forEach((id) => next.delete(id));
    } else {
      groupIds.forEach((id) => next.add(id));
    }
    onChange(next);
  }

  function toggleOne(perm: Permission) {
    const next = new Set(selected);
    if (next.has(perm.id)) {
      next.delete(perm.id);
    } else {
      next.add(perm.id);
    }
    onChange(next);
  }

  const headerId = `perm-group-${group.source}`;

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Group header row — flex row with button and checkbox as siblings (WCAG: no nested-interactive) */}
      <div className="flex items-center bg-muted/30">
        {/* Select-all checkbox — sibling to the expand button, not nested inside it */}
        <div className="pl-4 py-3 flex items-center">
          <Checkbox
            id={`${headerId}-all`}
            checked={allSelected}
            data-indeterminate={someSelected}
            disabled={disabled}
            onCheckedChange={toggleAll}
            aria-label={`Select all permissions in ${group.displayName}`}
          />
        </div>

        {/* Expand button — contains only the label text and chevron icon, no interactive children */}
        <button
          type="button"
          className="flex flex-1 items-center gap-3 px-3 py-3 cursor-pointer select-none text-left"
          aria-expanded={open}
          aria-controls={`${headerId}-panel`}
          id={headerId}
          onClick={() => setOpen((v) => !v)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setOpen((v) => !v);
            }
          }}
        >
          {/* Expand icon */}
          {open ? (
            <ChevronDown
              className="h-4 w-4 text-muted-foreground flex-shrink-0"
              aria-hidden="true"
            />
          ) : (
            <ChevronRight
              className="h-4 w-4 text-muted-foreground flex-shrink-0"
              aria-hidden="true"
            />
          )}

          <span className="flex-1 text-sm font-medium text-foreground">{group.displayName}</span>

          <Badge variant="secondary" className="text-xs tabular-nums">
            {selectedCount} / {groupIds.length}
          </Badge>
        </button>
      </div>

      {/* Permission list */}
      {open && (
        <div
          id={`${headerId}-panel`}
          role="region"
          aria-labelledby={headerId}
          className="divide-y divide-border"
        >
          {group.permissions.map((perm) => (
            <div key={perm.id} className="flex items-start gap-3 px-4 py-2.5 hover:bg-muted/10">
              <Checkbox
                id={`perm-${perm.id}`}
                checked={selected.has(perm.id)}
                disabled={disabled}
                onCheckedChange={() => toggleOne(perm)}
                className="mt-0.5"
              />
              <label htmlFor={`perm-${perm.id}`} className="flex-1 cursor-pointer">
                <div className="text-sm font-medium text-foreground">
                  {perm.resource}:{perm.action}
                </div>
                {perm.description && (
                  <div className="text-xs text-muted-foreground mt-0.5">{perm.description}</div>
                )}
              </label>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Accordion
// ---------------------------------------------------------------------------

export function PermissionGroupAccordion({
  groups,
  selected,
  onChange,
  disabled = false,
}: PermissionGroupAccordionProps) {
  if (groups.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">No permissions available.</p>
    );
  }

  return (
    <div className="space-y-2" role="list" aria-label="Permission groups">
      {groups.map((g) => (
        <div key={g.source} role="listitem">
          <GroupPanel group={g} selected={selected} onChange={onChange} disabled={disabled} />
        </div>
      ))}
    </div>
  );
}
