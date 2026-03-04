// File: apps/web/src/routes/admin.teams.$teamId.tsx
//
// T008-53 — Tenant Admin Team Detail screen.
// Shows team metadata, member list; supports add/remove members
// and rename/delete team.
// Spec 008 Admin Interfaces — Tenant Admin Phase 7

import { useState } from 'react';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, UserPlus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import {
  Button,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Skeleton,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@plexica/ui';
import {
  useAddTeamMember,
  useRemoveTeamMember,
  useDeleteTeam,
  useUpdateTeam,
} from '@/hooks/useTeams';
import { DestructiveConfirmModal } from '@/components/DestructiveConfirmModal';
import { getTenantTeams, getTenantUsers } from '@/api/admin';
import type { Team, TeamMember, TeamMemberRole } from '@/api/admin';

export const Route = createFileRoute('/admin/teams/$teamId' as never)({
  component: TeamDetailPage,
});

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

function useTeamDetail(teamId: string) {
  return useQuery({
    queryKey: ['tenant-admin', 'teams', teamId],
    queryFn: async () => {
      // The list endpoint returns paginated teams; fetch without pagination to find
      // the specific team. In production the backend may expose GET /tenant/teams/:id —
      // for now we fetch the full list and filter client-side.
      const result = await getTenantTeams({ limit: 200 });
      const team = result.data.find((t) => t.id === teamId);
      if (!team) throw new Error('Team not found');
      return team;
    },
    staleTime: 10_000,
  });
}

function useTenantUserList() {
  return useQuery({
    queryKey: ['tenant-admin', 'users', 'all'],
    queryFn: () => getTenantUsers({ limit: 200 }),
    staleTime: 30_000,
  });
}

// ---------------------------------------------------------------------------
// Role badge
// ---------------------------------------------------------------------------

function RoleBadge({ role }: { role: TeamMemberRole }) {
  const variants: Record<TeamMemberRole, 'default' | 'secondary' | 'outline' | 'warning'> = {
    OWNER: 'default',
    ADMIN: 'warning',
    MEMBER: 'secondary',
    VIEWER: 'outline',
  };
  return <Badge variant={variants[role]}>{role}</Badge>;
}

// ---------------------------------------------------------------------------
// Add Member Modal
// ---------------------------------------------------------------------------

const addMemberSchema = z.object({
  userId: z.string().min(1, 'Please select a user'),
  role: z.enum(['OWNER', 'ADMIN', 'MEMBER', 'VIEWER']),
});

interface AddMemberModalProps {
  open: boolean;
  onClose: () => void;
  teamId: string;
  existingMemberIds: string[];
}

function AddMemberModal({ open, onClose, teamId, existingMemberIds }: AddMemberModalProps) {
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<TeamMemberRole>('MEMBER');
  const [userError, setUserError] = useState('');

  const { data: usersData } = useTenantUserList();
  const addMember = useAddTeamMember();

  const availableUsers =
    usersData?.data.filter((u) => u.status === 'active' && !existingMemberIds.includes(u.id)) ?? [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = addMemberSchema.safeParse({ userId, role });
    if (!result.success) {
      setUserError(result.error.issues[0]?.message ?? 'Invalid');
      return;
    }
    try {
      await addMember.mutateAsync({ teamId, dto: { userId, role } });
      toast.success('Member added');
      setUserId('');
      setRole('MEMBER');
      onClose();
    } catch {
      toast.error('Failed to add member');
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent aria-labelledby="add-member-title">
        <DialogHeader>
          <DialogTitle id="add-member-title">Add Member</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => void handleSubmit(e)} noValidate>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="member-user">
                User{' '}
                <span aria-hidden="true" className="text-destructive">
                  *
                </span>
              </Label>
              <Select
                value={userId}
                onValueChange={(v) => {
                  setUserId(v);
                  if (userError) setUserError('');
                }}
              >
                <SelectTrigger
                  id="member-user"
                  aria-describedby={userError ? 'member-err' : undefined}
                >
                  <SelectValue placeholder="Select a user…" />
                </SelectTrigger>
                <SelectContent>
                  {availableUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name || u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {userError && (
                <p id="member-err" role="alert" className="text-xs text-destructive">
                  {userError}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="member-role">Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as TeamMemberRole)}>
                <SelectTrigger id="member-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OWNER">Owner</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                  <SelectItem value="MEMBER">Member</SelectItem>
                  <SelectItem value="VIEWER">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={addMember.isPending}>
              {addMember.isPending ? 'Adding…' : 'Add member'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Rename Team Modal
// ---------------------------------------------------------------------------

const renameSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
});

interface RenameModalProps {
  open: boolean;
  onClose: () => void;
  team: Team;
}

function RenameModal({ open, onClose, team }: RenameModalProps) {
  const [name, setName] = useState(team.name);
  const [nameError, setNameError] = useState('');
  const update = useUpdateTeam();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = renameSchema.safeParse({ name });
    if (!result.success) {
      setNameError(result.error.issues[0]?.message ?? 'Invalid');
      return;
    }
    try {
      await update.mutateAsync({ teamId: team.id, dto: { name, description: team.description } });
      toast.success('Team renamed');
      onClose();
    } catch {
      toast.error('Failed to rename team');
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent aria-labelledby="rename-team-title">
        <DialogHeader>
          <DialogTitle id="rename-team-title">Rename Team</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => void handleSubmit(e)} noValidate>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="rename-name">Team name</Label>
              <Input
                id="rename-name"
                value={name}
                aria-describedby={nameError ? 'rename-err' : undefined}
                onChange={(e) => {
                  setName(e.target.value);
                  if (nameError) setNameError('');
                }}
              />
              {nameError && (
                <p id="rename-err" role="alert" className="text-xs text-destructive">
                  {nameError}
                </p>
              )}
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Member row
// ---------------------------------------------------------------------------

interface MemberRowProps {
  member: TeamMember;
  teamId: string;
}

function MemberRow({ member, teamId }: MemberRowProps) {
  const [removeOpen, setRemoveOpen] = useState(false);
  const remove = useRemoveTeamMember();

  return (
    <>
      <tr className="border-b hover:bg-muted/20 transition-colors">
        <td className="px-4 py-3">
          <div className="font-medium text-foreground">{member.name || '—'}</div>
          <div className="text-xs text-muted-foreground">{member.email}</div>
        </td>
        <td className="px-4 py-3">
          <RoleBadge role={member.role} />
        </td>
        <td className="px-4 py-3 text-sm text-muted-foreground hidden sm:table-cell">
          {new Date(member.joinedAt).toLocaleDateString()}
        </td>
        <td className="px-4 py-3 text-right">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setRemoveOpen(true)}
            aria-label={`Remove ${member.name || member.email} from team`}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </td>
      </tr>

      <DestructiveConfirmModal
        open={removeOpen}
        onClose={() => setRemoveOpen(false)}
        title="Remove member"
        description={`Remove ${member.name || member.email} from this team?`}
        confirmLabel="Remove"
        onConfirm={() => {
          remove.mutate(
            { teamId, userId: member.userId },
            {
              onSuccess: () => toast.success('Member removed'),
              onError: () => toast.error('Failed to remove member'),
            }
          );
          setRemoveOpen(false);
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function TeamDetailPage() {
  const { teamId } = Route.useParams() as { teamId: string };
  const navigate = useNavigate();

  const [addOpen, setAddOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: team, isLoading, error } = useTeamDetail(teamId);
  const deleteTeam = useDeleteTeam();

  const members: TeamMember[] = team?.members ?? [];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !team) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-destructive text-sm"
      >
        Team not found or failed to load.{' '}
        <Link to={'/admin/teams' as never} className="underline">
          Back to teams
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back nav */}
      <div>
        <Link
          to={'/admin/teams' as never}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to teams
        </Link>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{team.name}</h1>
          {team.description && (
            <p className="text-sm text-muted-foreground mt-1">{team.description}</p>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            Created {new Date(team.createdAt).toLocaleDateString()}
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Button variant="outline" size="sm" onClick={() => setRenameOpen(true)}>
            Rename
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDeleteOpen(true)}
            className="text-destructive hover:text-destructive"
          >
            Delete team
          </Button>
        </div>
      </div>

      {/* Members table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between py-4">
          <CardTitle className="text-base">
            {members.length} member{members.length !== 1 ? 's' : ''}
          </CardTitle>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <UserPlus className="h-4 w-4 mr-2" aria-hidden="true" />
            Add member
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="Team members">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Name / Email
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Role
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left font-medium text-muted-foreground hidden sm:table-cell"
                  >
                    Joined
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-right font-medium text-muted-foreground"
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {members.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-10 text-center text-muted-foreground text-sm"
                    >
                      No members yet. Add one above.
                    </td>
                  </tr>
                ) : (
                  members.map((m) => <MemberRow key={m.userId} member={m} teamId={teamId} />)
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Modals */}
      <AddMemberModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        teamId={teamId}
        existingMemberIds={members.map((m) => m.userId)}
      />

      <RenameModal open={renameOpen} onClose={() => setRenameOpen(false)} team={team} />

      <DestructiveConfirmModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        variant="typed-confirm"
        confirmText={team.name}
        title="Delete team"
        description={`Permanently delete "${team.name}" and remove all ${members.length} member${members.length !== 1 ? 's' : ''} from it. This cannot be undone.`}
        confirmLabel="Delete team"
        onConfirm={() => {
          deleteTeam.mutate(teamId, {
            onSuccess: () => {
              toast.success(`Team "${team.name}" deleted`);
              void navigate({ to: '/admin/teams' as never });
            },
            onError: () => toast.error('Failed to delete team'),
          });
          setDeleteOpen(false);
        }}
      />
    </div>
  );
}
