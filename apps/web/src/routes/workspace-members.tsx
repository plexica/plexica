// apps/web/src/routes/workspace-members.tsx
//
// T8.6: Workspace members tab with proper Dialog-based member removal
// (replaces window.confirm() anti-pattern from members-management.tsx).
// Constitution Art. 1.3 — WCAG 2.1 AA (aria-label on role/remove buttons, T9.3).
// Constitution Art. 5.1 — Role changes and removal are ADMIN only.

import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { apiClient } from '@/lib/api-client';
import {
  Button,
  Badge,
  Skeleton,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@plexica/ui';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@plexica/ui';
import { AlertTriangle, UserPlus, UserMinus } from 'lucide-react';
import type { WorkspaceMember, WorkspaceRole } from '@/types';

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/workspace-members' as never)({
  component: WorkspaceMembersPage,
});

// ---------------------------------------------------------------------------
// Remove Member Dialog (T8.6 — replaces window.confirm)
// ---------------------------------------------------------------------------

interface RemoveMemberDialogProps {
  open: boolean;
  memberEmail: string;
  isLoading: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}

function RemoveMemberDialog({
  open,
  memberEmail,
  isLoading,
  error,
  onClose,
  onConfirm,
}: RemoveMemberDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <DialogContent
        role="dialog"
        aria-modal="true"
        aria-labelledby="remove-member-title"
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="sm:max-w-md"
      >
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 p-2 rounded-full bg-destructive/10">
              <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle
                id="remove-member-title"
                className="text-base font-semibold text-foreground"
              >
                Remove Member
              </DialogTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Remove <span className="font-medium text-foreground">{memberEmail}</span> from this
                workspace? They will lose all access immediately.
              </p>
            </div>
          </div>
        </DialogHeader>

        {/* Inline error */}
        {error && (
          <div
            role="alert"
            aria-live="polite"
            className="text-sm text-destructive flex items-center gap-1.5"
          >
            <AlertTriangle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
            {error}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isLoading}>
            {isLoading ? 'Removing…' : 'Remove Member'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// WorkspaceMembersPage
// ---------------------------------------------------------------------------

function WorkspaceMembersPage() {
  const { currentWorkspace, isAdmin } = useWorkspace();
  const queryClient = useQueryClient();

  const [removeTarget, setRemoveTarget] = useState<WorkspaceMember | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const workspaceId = currentWorkspace?.id;

  // ── Fetch members ──────────────────────────────────────────────────────────

  const { data: members = [], isLoading } = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () =>
      workspaceId
        ? (apiClient.getWorkspaceMembers(workspaceId) as Promise<WorkspaceMember[]>)
        : Promise.resolve([] as WorkspaceMember[]),
    enabled: !!workspaceId,
  });

  // ── Update role mutation ───────────────────────────────────────────────────

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: WorkspaceRole }) => {
      if (!workspaceId) throw new Error('No workspace selected');
      return apiClient.updateWorkspaceMemberRole(workspaceId, userId, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace-members', workspaceId] });
    },
  });

  // ── Remove member mutation ─────────────────────────────────────────────────

  const removeMutation = useMutation({
    mutationFn: (userId: string) => {
      if (!workspaceId) throw new Error('No workspace selected');
      return apiClient.removeWorkspaceMember(workspaceId, userId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace-members', workspaceId] });
      setRemoveTarget(null);
      setRemoveError(null);
    },
    onError: (err: any) => {
      setRemoveError(err?.response?.data?.error?.message || 'Failed to remove member');
    },
  });

  // ── Empty / loading / no-workspace guards ─────────────────────────────────

  if (!currentWorkspace) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-sm text-muted-foreground">No workspace selected</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-3 p-6">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  // ── Main render ────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-4 max-w-4xl">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Members</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {members.length} member{members.length !== 1 ? 's' : ''} in{' '}
            <span className="font-medium text-foreground">{currentWorkspace.name}</span>
          </p>
        </div>
      </div>

      {/* Members list */}
      {members.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 rounded-lg border border-dashed border-border text-center">
          <UserPlus className="h-8 w-8 text-muted-foreground mb-2" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">No members yet</p>
        </div>
      ) : (
        <ul className="space-y-2" role="list" aria-label="Workspace members">
          {members.map((member) => {
            const displayName = member.user
              ? `${member.user.firstName ?? ''} ${member.user.lastName ?? ''}`.trim() ||
                member.user.email
              : member.userId;
            const email = member.user?.email ?? member.userId;

            return (
              <li
                key={member.userId}
                className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-4"
              >
                {/* Identity */}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{displayName}</p>
                  {displayName !== email && (
                    <p className="text-xs text-muted-foreground truncate">{email}</p>
                  )}
                </div>

                {/* Role + Remove (ADMIN only) */}
                <div className="flex items-center gap-3 flex-shrink-0">
                  {isAdmin ? (
                    <Select
                      value={member.role}
                      onValueChange={(v) =>
                        updateRoleMutation.mutate({
                          userId: member.userId,
                          role: v as WorkspaceRole,
                        })
                      }
                      disabled={updateRoleMutation.isPending}
                    >
                      <SelectTrigger className="w-28" aria-label={`Change role for ${displayName}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ADMIN">Admin</SelectItem>
                        <SelectItem value="MEMBER">Member</SelectItem>
                        <SelectItem value="VIEWER">Viewer</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="secondary" className="text-xs">
                      {member.role}
                    </Badge>
                  )}

                  {isAdmin && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setRemoveTarget(member);
                        setRemoveError(null);
                      }}
                      aria-label={`Remove ${displayName}`}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <UserMinus className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Remove confirmation dialog */}
      <RemoveMemberDialog
        open={removeTarget !== null}
        memberEmail={removeTarget?.user?.email ?? removeTarget?.userId ?? ''}
        isLoading={removeMutation.isPending}
        error={removeError}
        onClose={() => {
          setRemoveTarget(null);
          setRemoveError(null);
        }}
        onConfirm={() => {
          if (removeTarget) removeMutation.mutate(removeTarget.userId);
        }}
      />
    </div>
  );
}
