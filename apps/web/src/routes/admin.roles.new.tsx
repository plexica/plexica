// File: apps/web/src/routes/admin.roles.new.tsx
//
// T008-54 — Create new custom role screen.
// Spec 008 Admin Interfaces — Tenant Admin Phase 7

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
import { useTenantPermissions, useCreateRole } from '@/hooks/useRoles';
import { PermissionGroupAccordion } from '@/components/PermissionGroupAccordion';

export const Route = createFileRoute('/admin/roles/new' as never)({
  component: CreateRolePage,
});

const createRoleSchema = z.object({
  name: z.string().min(1, 'Name is required').min(2, 'Name must be at least 2 characters'),
  description: z.string().optional(),
});

function CreateRolePage() {
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [nameError, setNameError] = useState('');
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(new Set());

  const { data: permGroups, isLoading: permsLoading } = useTenantPermissions();
  const createRole = useCreateRole();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = createRoleSchema.safeParse({ name, description });
    if (!result.success) {
      setNameError(result.error.issues[0]?.message ?? 'Invalid');
      return;
    }
    try {
      await createRole.mutateAsync({
        name,
        description: description || undefined,
        permissions: Array.from(selectedPermissions),
      });
      toast.success(`Role "${name}" created`);
      void navigate({ to: '/admin/roles' as never });
    } catch {
      toast.error('Failed to create role');
    }
  };

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
      <div>
        <h1 className="text-2xl font-bold text-foreground">Create Role</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Define a new role and assign permissions to it.
        </p>
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
                  placeholder="e.g. Editor"
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
                {selectedPermissions.size} permission
                {selectedPermissions.size !== 1 ? 's' : ''} selected
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
              ) : (
                <PermissionGroupAccordion
                  groups={permGroups ?? []}
                  selected={selectedPermissions}
                  onChange={setSelectedPermissions}
                  disabled={createRole.isPending}
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
          <Button type="submit" disabled={createRole.isPending}>
            {createRole.isPending ? 'Creating…' : 'Create role'}
          </Button>
        </div>
      </form>
    </div>
  );
}
