// File: apps/web/src/routes/admin.teams.tsx
//
// T008-53 — Tenant Admin Team List screen.
// Lists all teams; supports search, create, delete.
// Clicking a team navigates to admin.teams.$teamId.tsx.
// Spec 008 Admin Interfaces — Tenant Admin Phase 7

import { useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  Button,
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
} from '@plexica/ui';
import { useTenantTeams, useCreateTeam, useDeleteTeam } from '@/hooks/useTeams';
import { DestructiveConfirmModal } from '@/components/DestructiveConfirmModal';
import type { Team } from '@/api/admin';

export const Route = createFileRoute('/admin/teams' as never)({
  component: TenantAdminTeamsPage,
});

// ---------------------------------------------------------------------------
// Create Team Modal
// ---------------------------------------------------------------------------

const createTeamSchema = z.object({
  name: z.string().min(1, 'Name is required').min(2, 'Name must be at least 2 characters'),
  description: z.string().optional(),
});

interface CreateTeamModalProps {
  open: boolean;
  onClose: () => void;
}

function CreateTeamModal({ open, onClose }: CreateTeamModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [nameError, setNameError] = useState('');
  const createTeam = useCreateTeam();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = createTeamSchema.safeParse({ name, description });
    if (!result.success) {
      setNameError(result.error.issues[0]?.message ?? 'Invalid');
      return;
    }
    try {
      await createTeam.mutateAsync({ name, description: description || undefined });
      toast.success(`Team "${name}" created`);
      setName('');
      setDescription('');
      onClose();
    } catch {
      toast.error('Failed to create team');
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent aria-labelledby="create-team-title">
        <DialogHeader>
          <DialogTitle id="create-team-title">Create Team</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => void handleSubmit(e)} noValidate>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="team-name">
                Team name{' '}
                <span aria-hidden="true" className="text-destructive">
                  *
                </span>
              </Label>
              <Input
                id="team-name"
                value={name}
                placeholder="Engineering"
                aria-required="true"
                aria-describedby={nameError ? 'team-name-err' : undefined}
                onChange={(e) => {
                  setName(e.target.value);
                  if (nameError) setNameError('');
                }}
              />
              {nameError && (
                <p id="team-name-err" role="alert" className="text-xs text-destructive">
                  {nameError}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="team-desc">Description</Label>
              <Input
                id="team-desc"
                value={description}
                placeholder="Optional description"
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={createTeam.isPending}>
              {createTeam.isPending ? 'Creating…' : 'Create team'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Team row
// ---------------------------------------------------------------------------

interface TeamRowProps {
  team: Team;
}

function TeamRow({ team }: TeamRowProps) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const deleteTeam = useDeleteTeam();

  return (
    <>
      <tr className="border-b hover:bg-muted/20 transition-colors">
        <td className="px-4 py-3">
          <Link
            to={'/admin/teams/$teamId' as never}
            params={{ teamId: team.id } as never}
            className="font-medium text-foreground hover:underline"
          >
            {team.name}
          </Link>
          {team.description && (
            <p className="text-xs text-muted-foreground mt-0.5">{team.description}</p>
          )}
        </td>
        <td className="px-4 py-3 text-sm text-muted-foreground tabular-nums">{team.memberCount}</td>
        <td className="px-4 py-3 text-sm text-muted-foreground hidden sm:table-cell">
          {new Date(team.createdAt).toLocaleDateString()}
        </td>
        <td className="px-4 py-3 text-right">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setDeleteOpen(true)}
            aria-label={`Delete team ${team.name}`}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </td>
      </tr>

      <DestructiveConfirmModal
        open={deleteOpen}
        title="Delete team"
        description={`Are you sure you want to delete "${team.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={() => {
          deleteTeam.mutate(team.id, {
            onSuccess: () => toast.success(`Team "${team.name}" deleted`),
            onError: () => toast.error('Failed to delete team'),
          });
          setDeleteOpen(false);
        }}
        onClose={() => setDeleteOpen(false)}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function TenantAdminTeamsPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const LIMIT = 20;

  const { data, isLoading, error } = useTenantTeams({
    search: search || undefined,
    page,
    limit: LIMIT,
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Teams</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage groups of tenant members</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
          Create team
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search
          className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          placeholder="Search teams…"
          value={search}
          className="pl-9"
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          aria-label="Search teams"
        />
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-destructive text-sm"
        >
          Failed to load teams.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {data
              ? `${data.pagination.total} team${data.pagination.total !== 1 ? 's' : ''}`
              : 'Teams'}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="Teams table">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Name
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Members
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left font-medium text-muted-foreground hidden sm:table-cell"
                  >
                    Created
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
                {isLoading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="border-b" aria-hidden="true">
                        <td className="px-4 py-3">
                          <Skeleton className="h-4 w-32" />
                        </td>
                        <td className="px-4 py-3">
                          <Skeleton className="h-4 w-8" />
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <Skeleton className="h-4 w-24" />
                        </td>
                        <td className="px-4 py-3">
                          <Skeleton className="h-8 w-8 ml-auto" />
                        </td>
                      </tr>
                    ))
                  : data?.data.map((team) => <TeamRow key={team.id} team={team} />)}

                {!isLoading && data?.data.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-10 text-center text-muted-foreground text-sm"
                    >
                      No teams found. Create your first team above.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {data && data.pagination.totalPages > 1 && (
            <nav
              aria-label="Teams pagination"
              className="flex items-center justify-between px-4 py-3 border-t"
            >
              <p className="text-xs text-muted-foreground">
                Page {page} of {data.pagination.totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  aria-label="Previous page"
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= data.pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  aria-label="Next page"
                >
                  Next
                </Button>
              </div>
            </nav>
          )}
        </CardContent>
      </Card>

      <CreateTeamModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
