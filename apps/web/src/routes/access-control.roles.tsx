// apps/web/src/routes/access-control.roles.tsx
//
// Phase 3c — Spec 003 Access Control: Roles list screen.
// Lists all tenant roles with search/filter, create, and delete.
// Spec 003: Authorization System RBAC + ABAC

import { useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Plus, Trash2, Search } from 'lucide-react';
import { toast } from 'sonner';
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
import { useRoles, useDeleteRoleV2 } from '@/hooks/useRoles';
import { SystemRoleBadge } from '@/components/authorization/SystemRoleBadge';
import { DestructiveConfirmModal } from '@/components/DestructiveConfirmModal';
import type { RoleWithPermissions } from '@/hooks/useAuthorizationApi';

export const Route = createFileRoute('/access-control/roles' as never)({
  component: AccessControlRolesPage,
});

// ---------------------------------------------------------------------------
// Role row
// ---------------------------------------------------------------------------

interface RoleRowProps {
  role: RoleWithPermissions;
}

function RoleRow({ role }: RoleRowProps) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const deleteRole = useDeleteRoleV2();

  return (
    <>
      <tr className="border-b hover:bg-muted/20 transition-colors">
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            {role.isSystem ? (
              <span className="font-medium text-foreground">{role.name}</span>
            ) : (
              <Link
                to={'/access-control/roles/$roleId' as never}
                params={{ roleId: role.id } as never}
                className="font-medium text-foreground hover:underline"
              >
                {role.name}
              </Link>
            )}
            {role.isSystem && <SystemRoleBadge />}
          </div>
          {role.description && (
            <p className="text-xs text-muted-foreground mt-0.5">{role.description}</p>
          )}
        </td>
        <td className="px-4 py-3">
          {role.isSystem ? (
            <Badge variant="secondary">System</Badge>
          ) : (
            <Badge variant="outline">Custom</Badge>
          )}
        </td>
        <td className="px-4 py-3 text-sm text-muted-foreground tabular-nums">
          {role.permissions.length}
        </td>
        <td className="px-4 py-3 text-sm text-muted-foreground tabular-nums hidden sm:table-cell">
          {role.userCount}
        </td>
        <td className="px-4 py-3 text-right">
          {role.isSystem ? (
            <span className="text-xs text-muted-foreground">Read-only</span>
          ) : (
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" asChild>
                <Link
                  to={'/access-control/roles/$roleId/edit' as never}
                  params={{ roleId: role.id } as never}
                >
                  Edit
                </Link>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDeleteOpen(true)}
                aria-label={`Delete role ${role.name}`}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </div>
          )}
        </td>
      </tr>

      <DestructiveConfirmModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        variant="typed-confirm"
        confirmText={role.name}
        title="Delete role"
        description={`Permanently delete the "${role.name}" role. Users assigned this role will lose its permissions.`}
        confirmLabel="Delete"
        onConfirm={() => {
          deleteRole.mutate(role.id, {
            onSuccess: () => toast.success(`Role "${role.name}" deleted`),
            onError: () => toast.error('Failed to delete role'),
          });
          setDeleteOpen(false);
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function AccessControlRolesPage() {
  const [search, setSearch] = useState('');
  const { data, isLoading, error } = useRoles({ search: search || undefined });

  const roles = data?.data ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Roles</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage RBAC roles and their permission sets
          </p>
        </div>
        <Button asChild>
          <Link to={'/access-control/roles/create' as never}>
            <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
            Create role
          </Link>
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          placeholder="Search roles…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
          aria-label="Search roles"
        />
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-destructive text-sm"
        >
          Failed to load roles. Please refresh.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {data ? `${data.meta.total} role${data.meta.total !== 1 ? 's' : ''}` : 'Roles'}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="Roles table">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Name
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Type
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Permissions
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left font-medium text-muted-foreground hidden sm:table-cell"
                  >
                    Users
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
                  ? Array.from({ length: 4 }).map((_, i) => (
                      <tr key={i} className="border-b" aria-hidden="true">
                        <td className="px-4 py-3">
                          <Skeleton className="h-4 w-32" />
                        </td>
                        <td className="px-4 py-3">
                          <Skeleton className="h-5 w-16" />
                        </td>
                        <td className="px-4 py-3">
                          <Skeleton className="h-4 w-8" />
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <Skeleton className="h-4 w-8" />
                        </td>
                        <td className="px-4 py-3">
                          <Skeleton className="h-8 w-16 ml-auto" />
                        </td>
                      </tr>
                    ))
                  : roles.map((role) => <RoleRow key={role.id} role={role} />)}

                {!isLoading && roles.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-10 text-center text-muted-foreground text-sm"
                    >
                      {search ? 'No roles match your search.' : 'No roles found.'}
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
