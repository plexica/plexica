// apps/web/src/components/authorization/RoleAssignmentDialog.tsx
//
// Phase 3b — Dialog for assigning/removing roles on a user.
// Shows current roles as chips; available roles with checkboxes.
// Displays a diff preview before confirming.
// Spec 003: Authorization System RBAC + ABAC

import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@plexica/ui';
import { Button } from '@plexica/ui';
import { Badge } from '@plexica/ui';
import { Checkbox } from '@plexica/ui';
import { Skeleton } from '@plexica/ui';
import { toast } from 'sonner';
import { useRoles, useAssignUserRole, useRemoveUserRole } from '@/hooks/useRoles';

export interface RoleAssignmentDialogProps {
  userId: string;
  open: boolean;
  onClose: () => void;
  currentRoleIds: string[];
}

export function RoleAssignmentDialog({
  userId,
  open,
  onClose,
  currentRoleIds,
}: RoleAssignmentDialogProps) {
  const { data: rolePage, isLoading } = useRoles({ limit: 100 });
  const assignRole = useAssignUserRole();
  const removeRole = useRemoveUserRole();

  // Local pending set — starts from current assigned roles
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set(currentRoleIds));

  // Reset pending when dialog opens
  const [prevOpen, setPrevOpen] = useState(false);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setPendingIds(new Set(currentRoleIds));
    }
  }

  const roles = rolePage?.data ?? [];

  // Compute diff
  const toAdd = useMemo(
    () => roles.filter((r) => pendingIds.has(r.id) && !currentRoleIds.includes(r.id)),
    [roles, pendingIds, currentRoleIds]
  );
  const toRemove = useMemo(
    () => roles.filter((r) => !pendingIds.has(r.id) && currentRoleIds.includes(r.id)),
    [roles, pendingIds, currentRoleIds]
  );
  const hasDiff = toAdd.length > 0 || toRemove.length > 0;

  function toggle(roleId: string) {
    setPendingIds((prev) => {
      const next = new Set(prev);
      if (next.has(roleId)) {
        next.delete(roleId);
      } else {
        next.add(roleId);
      }
      return next;
    });
  }

  const isSubmitting = assignRole.isPending || removeRole.isPending;

  async function handleConfirm() {
    try {
      // Run removes first, then adds
      await Promise.all(toRemove.map((r) => removeRole.mutateAsync({ userId, roleId: r.id })));
      await Promise.all(toAdd.map((r) => assignRole.mutateAsync({ userId, roleId: r.id })));
      toast.success('Roles updated successfully');
      onClose();
    } catch {
      toast.error('Failed to update roles. Please try again.');
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md" aria-labelledby="role-assignment-title">
        <DialogHeader>
          <DialogTitle id="role-assignment-title">Manage Roles</DialogTitle>
        </DialogHeader>

        {/* Current roles (chips) */}
        {currentRoleIds.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Current Roles
            </p>
            <div className="flex flex-wrap gap-1.5">
              {currentRoleIds.map((id) => {
                const role = roles.find((r) => r.id === id);
                return (
                  <Badge key={id} variant="secondary">
                    {role?.name ?? id}
                  </Badge>
                );
              })}
            </div>
          </div>
        )}

        {/* Role list */}
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Available Roles
          </p>
          {isLoading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 py-1">
                  <Skeleton className="h-4 w-4 rounded" />
                  <Skeleton className="h-4 w-40" />
                </div>
              ))
            : roles.map((role) => (
                <div key={role.id} className="flex items-center gap-3 py-1">
                  <Checkbox
                    id={`role-assign-${role.id}`}
                    checked={pendingIds.has(role.id)}
                    onCheckedChange={() => toggle(role.id)}
                    disabled={isSubmitting || role.isSystem}
                  />
                  <label
                    htmlFor={`role-assign-${role.id}`}
                    className="text-sm text-foreground cursor-pointer flex-1"
                  >
                    {role.name}
                    {role.isSystem && (
                      <span className="ml-1 text-xs text-muted-foreground">(system)</span>
                    )}
                  </label>
                </div>
              ))}
        </div>

        {/* Diff preview */}
        {hasDiff && (
          <div className="rounded-md border border-border bg-muted/20 p-3 text-xs space-y-1">
            {toAdd.length > 0 && (
              <p className="text-green-600">Adding: {toAdd.map((r) => r.name).join(', ')}</p>
            )}
            {toRemove.length > 0 && (
              <p className="text-destructive">Removing: {toRemove.map((r) => r.name).join(', ')}</p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={() => void handleConfirm()} disabled={!hasDiff || isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
