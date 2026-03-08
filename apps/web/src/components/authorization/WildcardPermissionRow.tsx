// apps/web/src/components/authorization/WildcardPermissionRow.tsx
//
// Phase 3b — Single permission row with checkbox.
// Wildcard permissions (key ending in ':*') are visually indicated.
// Spec 003: Authorization System RBAC + ABAC
//
// WCAG 2.1 AA: checkbox has aria-label; description is rendered as plain text.

import { Checkbox } from '@plexica/ui';
import type { Permission } from '@/hooks/useAuthorizationApi';

export interface WildcardPermissionRowProps {
  permission: Permission;
  selected: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

export function WildcardPermissionRow({
  permission,
  selected,
  onToggle,
  disabled = false,
}: WildcardPermissionRowProps) {
  const isWildcard = permission.key.endsWith(':*');
  const checkboxId = `perm-row-${permission.id}`;

  return (
    <div className="flex items-start gap-3 px-4 py-2.5 hover:bg-muted/10">
      <Checkbox
        id={checkboxId}
        checked={selected}
        disabled={disabled}
        onCheckedChange={() => {
          if (!disabled) onToggle();
        }}
        aria-label={permission.key}
        className="mt-0.5"
      />
      <label htmlFor={checkboxId} className="flex-1 cursor-pointer select-none">
        <div className="text-sm font-medium text-foreground flex items-center gap-1.5">
          <code className="font-mono text-xs">{permission.key}</code>
          {isWildcard && <span className="text-xs text-muted-foreground">(wildcard)</span>}
        </div>
        {permission.description && (
          <div className="text-xs text-muted-foreground mt-0.5">{permission.description}</div>
        )}
      </label>
    </div>
  );
}
