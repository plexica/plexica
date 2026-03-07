// apps/web/src/components/authorization/PermissionGroupAccordion.tsx
//
// Phase 3b — Spec 003 version of PermissionGroupAccordion.
// Groups permissions by source string, with select-all per group.
// NOTE: This is the NEW Spec 003 component. The Spec 008 version remains
// at apps/web/src/components/PermissionGroupAccordion.tsx (unmodified).
//
// Spec 003: Authorization System RBAC + ABAC
//
// WCAG 2.1 AA: role="group", aria-label, keyboard accessible expand.

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Checkbox } from '@plexica/ui';
import { Badge } from '@plexica/ui';
import { WildcardPermissionRow } from './WildcardPermissionRow';
import type { Permission } from '@/hooks/useAuthorizationApi';

export interface PermissionGroupAccordionProps {
  source: string;
  permissions: Permission[];
  selected: string[];
  onChange: (selected: string[]) => void;
  disabled?: boolean;
}

export function PermissionGroupAccordion({
  source,
  permissions,
  selected,
  onChange,
  disabled = false,
}: PermissionGroupAccordionProps) {
  const [open, setOpen] = useState(false);

  const selectedSet = new Set(selected);
  const groupIds = permissions.map((p) => p.id);
  const selectedCount = groupIds.filter((id) => selectedSet.has(id)).length;
  const allSelected = permissions.length > 0 && selectedCount === permissions.length;
  const someSelected = selectedCount > 0 && !allSelected;

  function toggleAll() {
    const next = new Set(selected);
    if (allSelected) {
      groupIds.forEach((id) => next.delete(id));
    } else {
      groupIds.forEach((id) => next.add(id));
    }
    onChange(Array.from(next));
  }

  function toggleOne(permId: string) {
    const next = new Set(selected);
    if (next.has(permId)) {
      next.delete(permId);
    } else {
      next.add(permId);
    }
    onChange(Array.from(next));
  }

  const headerId = `authz-perm-group-${source.replace(/\s+/g, '-')}`;

  return (
    <div className="border rounded-lg overflow-hidden" role="group" aria-label={source}>
      {/* Group header */}
      <div className="flex items-center bg-muted/30">
        {/* Select-all checkbox */}
        <div className="pl-4 py-3 flex items-center">
          <Checkbox
            id={`${headerId}-all`}
            checked={allSelected}
            data-indeterminate={someSelected}
            disabled={disabled}
            onCheckedChange={toggleAll}
            aria-label={`Select all permissions in ${source}`}
          />
        </div>

        {/* Expand/collapse button */}
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
          <span className="flex-1 text-sm font-medium text-foreground">{source}</span>
          <Badge variant="secondary" className="text-xs tabular-nums">
            {selectedCount} / {permissions.length}
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
          {permissions.map((perm) => (
            <WildcardPermissionRow
              key={perm.id}
              permission={perm}
              selected={selectedSet.has(perm.id)}
              onToggle={() => toggleOne(perm.id)}
              disabled={disabled}
            />
          ))}
        </div>
      )}
    </div>
  );
}
