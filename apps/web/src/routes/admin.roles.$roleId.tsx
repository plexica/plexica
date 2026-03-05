// File: apps/web/src/routes/admin.roles.$roleId.tsx
//
// T008-54 — Edit custom role screen.
// Allows renaming a role and updating its permission set.
// System roles are read-only and redirect back to the list.
// Spec 008 Admin Interfaces — Tenant Admin Phase 7

import { useEffect, useState } from 'react';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
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
} from '@plexica/ui';
import {
  useTenantRoles,
  useTenantPermissions,
  useUpdateRole,
  useDeleteRole,
} from '@/hooks/useRoles';
import { DestructiveConfirmModal } from '@/components/DestructiveConfirmModal';
import { PermissionGroupAccordion } from '@/components/PermissionGroupAccordion';

export const Route = createFileRoute('/admin/roles/$roleId' as never)({
  component: EditRolePage,
});

const updateRoleSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  description: z.string().optional(),
});

function EditRolePage() {
  const { roleId } = Route.useParams() as { roleId: string };
  const navigate = useNavigate();

  const { data: roles, isLoading: rolesLoading } = useTenantRoles();
  const { data: permGroups, isLoading: permsLoading } = useTenantPermissions();
  const updateRole = useUpdateRole();
  const deleteRole = useDeleteRole();

  const role = roles?.find((r) => r.id === roleId);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [nameError, setNameError] = useState('');
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(new Set());
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Seed form when role loads
  useEffect(() => {
    if (role) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setName(role.name);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDescription(role.description ?? '');
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedPermissions(new Set(role.permissions));
    }
  }, [role]);

  // Redirect if system role
  useEffect(() => {
    if (role?.isSystem) {
      void navigate({ to: '/admin/roles' as never });
    }
  }, [role, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = updateRoleSchema.safeParse({ name, description });
    if (!result.success) {
      setNameError(result.error.issues[0]?.message ?? 'Invalid');
      return;
    }
    try {
      await updateRole.mutateAsync({
        roleId,
        dto: {
          name,
          description: description || undefined,
          permissions: Array.from(selectedPermissions),
        },
      });
      toast.success('Role updated');
    } catch {
      toast.error('Failed to update role');
    }
  };

  if (rolesLoading) {
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

  if (!role) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-destructive text-sm"
      >
        Role not found.{' '}
        <Link to={'/admin/roles' as never} className="underline">
          Back to roles
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back nav */}
      <div>
        <Link
          to={'/admin/roles' as never}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to roles
        </Link>
      </div>

      {/* Page title */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground">{role.name}</h1>
          <Badge variant="outline">Custom</Badge>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setDeleteOpen(true)}
          className="text-destructive hover:text-destructive"
        >
          Delete role
        </Button>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} noValidate>
        <div className="grid gap-6 lg:grid-cols-[1fr_1.5fr]">
          {/* Role details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Role Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="role-name">
                  Name{' '}
                  <span aria-hidden="true" className="text-destructive">
                    *
                  </span>
                </Label>
                <Input
                  id="role-name"
                  value={name}
                  aria-required="true"
                  aria-describedby={nameError ? 'role-name-err' : undefined}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (nameError) setNameError('');
                  }}
                />
                {nameError && (
                  <p id="role-name-err" role="alert" className="text-xs text-destructive">
                    {nameError}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="role-description">Description</Label>
                <Input
                  id="role-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div className="text-xs text-muted-foreground space-y-1">
                <p>
                  {selectedPermissions.size} permission{selectedPermissions.size !== 1 ? 's' : ''}{' '}
                  selected
                </p>
                <p>
                  {role.userCount} user{role.userCount !== 1 ? 's' : ''} assigned
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Permissions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Permissions</CardTitle>
            </CardHeader>
            <CardContent>
              {permsLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : (
                <PermissionGroupAccordion
                  groups={permGroups ?? []}
                  selected={selectedPermissions}
                  onChange={setSelectedPermissions}
                  disabled={updateRole.isPending}
                />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 mt-6">
          <Button type="button" variant="outline" asChild>
            <Link to={'/admin/roles' as never}>Cancel</Link>
          </Button>
          <Button type="submit" disabled={updateRole.isPending}>
            {updateRole.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </form>

      <DestructiveConfirmModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        variant="typed-confirm"
        confirmText={role.name}
        title="Delete role"
        description={`Permanently delete "${role.name}". Users assigned this role will lose its permissions.`}
        confirmLabel="Delete"
        onConfirm={() => {
          deleteRole.mutate(roleId, {
            onSuccess: () => {
              toast.success(`Role "${role.name}" deleted`);
              void navigate({ to: '/admin/roles' as never });
            },
            onError: () => toast.error('Failed to delete role'),
          });
          setDeleteOpen(false);
        }}
      />
    </div>
  );
}
