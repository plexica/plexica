// apps/web/src/routes/access-control.roles.create.tsx
//
// Phase 3c — Spec 003 Access Control: Create role screen.
// Form for name, description, and permission selection.
// Spec 003: Authorization System RBAC + ABAC

import { useState } from 'react';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
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
} from '@plexica/ui';
import { useCreateRoleV2 } from '@/hooks/useRoles';
import { usePermissions } from '@/hooks/usePermissions';
import { PermissionGroupAccordion } from '@/components/authorization/PermissionGroupAccordion';

export const Route = createFileRoute('/access-control/roles/create' as never)({
  component: CreateRolePage,
});

const createRoleSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  description: z.string().optional(),
});

function CreateRolePage() {
  const navigate = useNavigate();
  const { data: permsData, isLoading: permsLoading } = usePermissions({ limit: 500 });
  const createRole = useCreateRoleV2();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [nameError, setNameError] = useState('');
  const [selectedPermIds, setSelectedPermIds] = useState<string[]>([]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = createRoleSchema.safeParse({ name, description });
    if (!result.success) {
      setNameError(result.error.issues[0]?.message ?? 'Invalid');
      return;
    }
    try {
      const role = await createRole.mutateAsync({
        name: result.data.name,
        description: result.data.description,
        permissionIds: selectedPermIds,
      });
      toast.success(`Role "${role.name}" created`);
      void navigate({
        to: '/access-control/roles/$roleId' as never,
        params: { roleId: role.id } as never,
      });
    } catch {
      toast.error('Failed to create role');
    }
  };

  // Build groups from the flat permissions response
  const groups = permsData
    ? Object.entries(permsData.groups).map(([source, perms]) => ({ source, perms }))
    : [];

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

      <h1 className="text-2xl font-bold text-foreground">Create role</h1>

      <form onSubmit={(e) => void handleSubmit(e)} noValidate>
        <div className="grid gap-6 lg:grid-cols-[1fr_1.5fr]">
          {/* Role details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Role details</CardTitle>
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
                  placeholder="e.g. Content Editor"
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
                  placeholder="Optional description"
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <p className="text-xs text-muted-foreground">
                {selectedPermIds.length} permission{selectedPermIds.length !== 1 ? 's' : ''}{' '}
                selected
              </p>
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
              ) : groups.length === 0 ? (
                <p className="text-sm text-muted-foreground">No permissions available.</p>
              ) : (
                <div className="space-y-2">
                  {groups.map(({ source, perms }) => (
                    <PermissionGroupAccordion
                      key={source}
                      source={source}
                      permissions={perms}
                      selected={selectedPermIds}
                      onChange={setSelectedPermIds}
                      disabled={createRole.isPending}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 mt-6">
          <Button type="button" variant="outline" asChild>
            <Link to={'/access-control/roles' as never}>Cancel</Link>
          </Button>
          <Button type="submit" disabled={createRole.isPending}>
            {createRole.isPending ? 'Creating…' : 'Create role'}
          </Button>
        </div>
      </form>
    </div>
  );
}
