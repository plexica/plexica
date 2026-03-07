// apps/web/src/routes/access-control.roles.$roleId.tsx
//
// Phase 3c — Spec 003 Access Control: Role detail view (read-only overview).
// Shows role metadata, permission list, and assigned users count.
// Spec 003: Authorization System RBAC + ABAC

import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft, Edit } from 'lucide-react';
import { Button, Badge, Card, CardContent, CardHeader, CardTitle, Skeleton } from '@plexica/ui';
import { useRole } from '@/hooks/useRoles';
import { SystemRoleBadge } from '@/components/authorization/SystemRoleBadge';

export const Route = createFileRoute('/access-control/roles/$roleId' as never)({
  component: RoleDetailPage,
});

function RoleDetailPage() {
  const { roleId } = Route.useParams() as { roleId: string };
  const { data: role, isLoading, error } = useRole(roleId);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-6 lg:grid-cols-[1fr_1.5fr]">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-80 w-full" />
        </div>
      </div>
    );
  }

  if (error || !role) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-destructive text-sm"
      >
        Role not found.{' '}
        <Link to={'/access-control/roles' as never} className="underline">
          Back to roles
        </Link>
      </div>
    );
  }

  // Group permissions by source (pluginId or 'core')
  const permsBySource = role.permissions.reduce<Record<string, typeof role.permissions>>(
    (acc, p) => {
      const key = p.pluginId ?? 'core';
      if (!acc[key]) acc[key] = [];
      acc[key].push(p);
      return acc;
    },
    {}
  );

  return (
    <div className="space-y-6">
      {/* Back nav */}
      <div>
        <Link
          to={'/access-control/roles' as never}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to roles
        </Link>
      </div>

      {/* Page title */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground">{role.name}</h1>
          {role.isSystem ? <SystemRoleBadge /> : <Badge variant="outline">Custom</Badge>}
        </div>
        {!role.isSystem && (
          <Button asChild>
            <Link
              to={'/access-control/roles/$roleId/edit' as never}
              params={{ roleId: role.id } as never}
            >
              <Edit className="h-4 w-4 mr-2" aria-hidden="true" />
              Edit role
            </Link>
          </Button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.5fr]">
        {/* Role details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {role.description && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                  Description
                </p>
                <p className="text-foreground">{role.description}</p>
              </div>
            )}
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                Users assigned
              </p>
              <p className="text-foreground tabular-nums">{role.userCount}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                Total permissions
              </p>
              <p className="text-foreground tabular-nums">{role.permissions.length}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                Created
              </p>
              <p className="text-foreground">{new Date(role.createdAt).toLocaleDateString()}</p>
            </div>
          </CardContent>
        </Card>

        {/* Permissions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Permissions ({role.permissions.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {role.permissions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No permissions assigned.</p>
            ) : (
              <div className="space-y-4">
                {Object.entries(permsBySource).map(([source, perms]) => (
                  <div key={source}>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                      {source === 'core' ? 'Core' : `Plugin: ${source}`}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {perms.map((p) => (
                        <Badge key={p.id} variant="secondary" className="font-mono text-xs">
                          {p.key}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
