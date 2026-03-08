// apps/web/src/routes/access-control.users.tsx
//
// Phase 3c — Spec 003 Access Control: Users with role assignments screen.
// Lists tenant users and allows managing their role assignments inline.
// Spec 003: Authorization System RBAC + ABAC

import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Search, Users } from 'lucide-react';
import {
  Button,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Skeleton,
} from '@plexica/ui';
import { useTenantUsers } from '@/hooks/useUsers';
import { useRoles } from '@/hooks/useRoles';
import { RoleAssignmentDialog } from '@/components/authorization/RoleAssignmentDialog';
import type { TenantUser } from '@/api/admin';
import type { RoleWithPermissions } from '@/hooks/useAuthorizationApi';

export const Route = createFileRoute('/access-control/users' as never)({
  component: AccessControlUsersPage,
});

// ---------------------------------------------------------------------------
// User status badge
// ---------------------------------------------------------------------------

const STATUS_VARIANTS: Record<string, 'success' | 'warning' | 'secondary' | 'danger'> = {
  active: 'success',
  invited: 'warning',
  expired: 'warning',
  inactive: 'secondary',
  cancelled: 'danger',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={STATUS_VARIANTS[status] ?? 'secondary'} className="capitalize">
      {status}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// User row
// ---------------------------------------------------------------------------

interface UserRowProps {
  user: TenantUser;
  allRoles: RoleWithPermissions[];
}

function UserRow({ user, allRoles }: UserRowProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  // Determine current role objects from user.roles (array of role names or IDs)
  const currentRoles = allRoles.filter(
    (r) => user.roles.includes(r.id) || user.roles.includes(r.name)
  );

  return (
    <>
      <tr className="border-b hover:bg-muted/20 transition-colors">
        <td className="px-4 py-3">
          <div className="font-medium text-foreground text-sm">{user.name}</div>
          <div className="text-xs text-muted-foreground">{user.email}</div>
        </td>
        <td className="px-4 py-3">
          <StatusBadge status={user.status} />
        </td>
        <td className="px-4 py-3">
          <div className="flex flex-wrap gap-1">
            {currentRoles.length === 0 ? (
              <span className="text-xs text-muted-foreground">No roles</span>
            ) : (
              currentRoles.map((r) => (
                <Badge key={r.id} variant="outline" className="text-xs">
                  {r.name}
                </Badge>
              ))
            )}
          </div>
        </td>
        <td className="px-4 py-3 text-right">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setDialogOpen(true)}
            aria-label={`Manage roles for ${user.name}`}
          >
            Manage roles
          </Button>
        </td>
      </tr>

      <RoleAssignmentDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        userId={user.id}
        currentRoleIds={currentRoles.map((r) => r.id)}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function AccessControlUsersPage() {
  const [search, setSearch] = useState('');
  const {
    data: usersData,
    isLoading: usersLoading,
    error: usersError,
  } = useTenantUsers({ search: search || undefined });
  const { data: rolesData, isLoading: rolesLoading } = useRoles({ limit: 500 });

  const users = usersData?.data ?? [];
  const allRoles = rolesData?.data ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Users className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">User role assignments</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Assign and remove roles from tenant users
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          placeholder="Search users…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
          aria-label="Search users"
        />
      </div>

      {usersError && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-destructive text-sm"
        >
          Failed to load users. Please refresh.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {usersData
              ? `${usersData.pagination.total} user${usersData.pagination.total !== 1 ? 's' : ''}`
              : 'Users'}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="Users role assignment table">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                    User
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Roles
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
                {usersLoading || rolesLoading
                  ? Array.from({ length: 4 }).map((_, i) => (
                      <tr key={i} className="border-b" aria-hidden="true">
                        <td className="px-4 py-3">
                          <Skeleton className="h-4 w-36 mb-1" />
                          <Skeleton className="h-3 w-48" />
                        </td>
                        <td className="px-4 py-3">
                          <Skeleton className="h-5 w-16" />
                        </td>
                        <td className="px-4 py-3">
                          <Skeleton className="h-5 w-24" />
                        </td>
                        <td className="px-4 py-3">
                          <Skeleton className="h-8 w-28 ml-auto" />
                        </td>
                      </tr>
                    ))
                  : users.map((user) => <UserRow key={user.id} user={user} allRoles={allRoles} />)}

                {!usersLoading && !rolesLoading && users.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-10 text-center text-muted-foreground text-sm"
                    >
                      {search ? 'No users match your search.' : 'No users found.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
