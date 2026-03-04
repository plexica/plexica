// File: apps/web/src/routes/admin.users.tsx
//
// T008-52 — Tenant Admin User List + Invite screen.
// Lists users in the current tenant; supports search, status filter,
// invite new user, deactivate/reactivate actions.
// Spec 008 Admin Interfaces — Tenant Admin Phase 7

import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { UserPlus, Search } from 'lucide-react';
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
  Badge,
  Skeleton,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@plexica/ui';
import {
  useTenantUsers,
  useInviteUser,
  useDeactivateUser,
  useReactivateUser,
} from '@/hooks/useUsers';
import type { TenantUser, TenantUserStatus } from '@/api/admin';

export const Route = createFileRoute('/admin/users' as never)({
  component: TenantAdminUsersPage,
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const inviteSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Must be a valid email'),
});

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function UserStatusBadge({ status }: { status: TenantUserStatus }) {
  const variants: Record<
    TenantUserStatus,
    { label: string; variant: 'default' | 'secondary' | 'danger' | 'outline' }
  > = {
    active: { label: 'Active', variant: 'default' },
    inactive: { label: 'Inactive', variant: 'secondary' },
    invited: { label: 'Invited', variant: 'outline' },
    expired: { label: 'Expired', variant: 'danger' },
    cancelled: { label: 'Cancelled', variant: 'danger' },
  };
  const { label, variant } = variants[status] ?? { label: status, variant: 'outline' };
  return <Badge variant={variant}>{label}</Badge>;
}

// ---------------------------------------------------------------------------
// Invite Modal
// ---------------------------------------------------------------------------

interface InviteModalProps {
  open: boolean;
  onClose: () => void;
}

function InviteModal({ open, onClose }: InviteModalProps) {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const invite = useInviteUser();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = inviteSchema.safeParse({ email });
    if (!result.success) {
      setEmailError(result.error.issues[0]?.message ?? 'Invalid email');
      return;
    }
    try {
      await invite.mutateAsync({ email });
      toast.success(`Invitation sent to ${email}`);
      setEmail('');
      onClose();
    } catch {
      toast.error('Failed to send invitation');
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent aria-labelledby="invite-dialog-title">
        <DialogHeader>
          <DialogTitle id="invite-dialog-title">Invite User</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => void handleSubmit(e)} noValidate>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="invite-email">
                Email address{' '}
                <span aria-hidden="true" className="text-destructive">
                  *
                </span>
              </Label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                placeholder="user@example.com"
                aria-required="true"
                aria-describedby={emailError ? 'invite-email-err' : undefined}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (emailError) setEmailError('');
                }}
              />
              {emailError && (
                <p id="invite-email-err" role="alert" className="text-xs text-destructive">
                  {emailError}
                </p>
              )}
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={invite.isPending}>
              {invite.isPending ? 'Sending…' : 'Send invitation'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// User row actions
// ---------------------------------------------------------------------------

interface UserActionsProps {
  user: TenantUser;
}

function UserActions({ user }: UserActionsProps) {
  const deactivate = useDeactivateUser();
  const reactivate = useReactivateUser();

  if (user.status === 'active') {
    return (
      <Button
        size="sm"
        variant="outline"
        disabled={deactivate.isPending}
        onClick={() => {
          deactivate.mutate(user.id, {
            onSuccess: () => toast.success(`${user.email} deactivated`),
            onError: () => toast.error('Failed to deactivate user'),
          });
        }}
      >
        Deactivate
      </Button>
    );
  }

  if (user.status === 'inactive') {
    return (
      <Button
        size="sm"
        variant="outline"
        disabled={reactivate.isPending}
        onClick={() => {
          reactivate.mutate(user.id, {
            onSuccess: () => toast.success(`${user.email} reactivated`),
            onError: () => toast.error('Failed to reactivate user'),
          });
        }}
      >
        Reactivate
      </Button>
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function TenantAdminUsersPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [inviteOpen, setInviteOpen] = useState(false);
  const LIMIT = 20;

  const { data, isLoading, error } = useTenantUsers({
    search: search || undefined,
    page,
    limit: LIMIT,
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Users</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage tenant members and invitations
          </p>
        </div>
        <Button onClick={() => setInviteOpen(true)}>
          <UserPlus className="h-4 w-4 mr-2" aria-hidden="true" />
          Invite user
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
          placeholder="Search by name or email…"
          value={search}
          className="pl-9"
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          aria-label="Search users"
        />
      </div>

      {/* Error */}
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-destructive text-sm"
        >
          Failed to load users. Please refresh to try again.
        </div>
      )}

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {data
              ? `${data.pagination.total} user${data.pagination.total !== 1 ? 's' : ''}`
              : 'Users'}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="Users table">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Name / Email
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Status
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left font-medium text-muted-foreground hidden sm:table-cell"
                  >
                    Roles
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left font-medium text-muted-foreground hidden md:table-cell"
                  >
                    Last login
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
                          <Skeleton className="h-4 w-40" />
                        </td>
                        <td className="px-4 py-3">
                          <Skeleton className="h-5 w-16" />
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <Skeleton className="h-4 w-24" />
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <Skeleton className="h-4 w-28" />
                        </td>
                        <td className="px-4 py-3">
                          <Skeleton className="h-8 w-20 ml-auto" />
                        </td>
                      </tr>
                    ))
                  : data?.data.map((user) => (
                      <tr key={user.id} className="border-b hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium text-foreground">{user.name || '—'}</div>
                          <div className="text-xs text-muted-foreground">{user.email}</div>
                        </td>
                        <td className="px-4 py-3">
                          <UserStatusBadge status={user.status} />
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground">
                          {user.roles.length > 0 ? user.roles.join(', ') : '—'}
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">
                          {user.lastLoginAt
                            ? new Date(user.lastLoginAt).toLocaleDateString()
                            : 'Never'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <UserActions user={user} />
                        </td>
                      </tr>
                    ))}

                {!isLoading && data?.data.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-10 text-center text-muted-foreground text-sm"
                    >
                      No users found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data && data.pagination.totalPages > 1 && (
            <nav
              aria-label="Users pagination"
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

      <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} />
    </div>
  );
}
