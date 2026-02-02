// apps/web/src/routes/members-management.tsx

import { createFileRoute } from '@tanstack/react-router';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { AppLayout } from '../components/Layout';
import { useAuthStore } from '../stores/auth-store';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';
import { useState } from 'react';
import type { ChangeEvent } from 'react';
import { Button } from '@plexica/ui';
import { Alert, AlertDescription } from '@plexica/ui';
import { AlertCircle, Plus } from 'lucide-react';
import { DataTable } from '@plexica/ui';
import { SearchableSelect } from '@plexica/ui';
import type { ColumnDef } from '@tanstack/react-table';
import type { WorkspaceMember, WorkspaceRole } from '../types';
import { useForm } from '@/hooks/useForm';
import { toast } from '@/components/ToastProvider';
import { z } from 'zod';

export const Route = createFileRoute('/members-management')({
  component: MembersManagementPage,
});

function MembersManagementPage() {
  const { tenant } = useAuthStore();
  const queryClient = useQueryClient();
  const [showInviteDialog, setShowInviteDialog] = useState(false);

  // Fetch workspace members - using tenant as workspace context
  const {
    data: membersData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['workspace-members', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return { members: [] };
      return await apiClient.getWorkspaceMembers(tenant.id);
    },
    enabled: !!tenant?.id,
  });

  // Update member role mutation
  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: WorkspaceRole }) => {
      if (!tenant?.id) throw new Error('No workspace selected');
      return await apiClient.updateWorkspaceMemberRole(tenant.id, userId, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace-members'] });
      toast.success('Member role updated');
    },
    onError: () => {
      toast.error('Failed to update member role');
    },
  });

  // Remove member mutation
  const removeMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      if (!tenant?.id) throw new Error('No workspace selected');
      return await apiClient.removeWorkspaceMember(tenant.id, userId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace-members'] });
      toast.success('Member removed');
    },
    onError: () => {
      toast.error('Failed to remove member');
    },
  });

  const members: WorkspaceMember[] = membersData?.members || [];

  return (
    <ProtectedRoute>
      <AppLayout>
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-foreground mb-2">Members</h1>
              <p className="text-muted-foreground">Manage workspace members and their roles</p>
            </div>
            <Button onClick={() => setShowInviteDialog(true)} size="lg">
              <Plus className="h-4 w-4 mr-2" />
              Invite Member
            </Button>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>
              <strong className="text-foreground">{members.length}</strong> members
            </span>
            <span>•</span>
            <span>
              <strong className="text-foreground">
                {members.filter((m) => m.role === 'ADMIN').length}
              </strong>{' '}
              admins
            </span>
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent mb-4"></div>
              <p className="text-muted-foreground">Loading members...</p>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>Failed to load members. Please try again later.</AlertDescription>
          </Alert>
        )}

        {/* Empty State */}
        {!isLoading && !error && members.length === 0 && (
          <div className="bg-card border border-border rounded-lg p-12 text-center">
            <div className="text-6xl mb-4">👥</div>
            <h3 className="text-xl font-semibold text-foreground mb-2">No members yet</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Invite team members to collaborate in this workspace.
            </p>
            <Button onClick={() => setShowInviteDialog(true)} size="lg">
              <Plus className="h-4 w-4 mr-2" />
              Invite Your First Member
            </Button>
          </div>
        )}

        {/* Members Table */}
        {!isLoading && !error && members.length > 0 && (
          <MembersTable
            members={members}
            onUpdateRole={(userId, role) => updateRoleMutation.mutate({ userId, role })}
            onRemoveMember={(userId) => {
              if (confirm('Are you sure you want to remove this member?')) {
                removeMemberMutation.mutate(userId);
              }
            }}
            isUpdatingRole={updateRoleMutation.isPending}
            isRemovingMember={removeMemberMutation.isPending}
          />
        )}

        {/* Invite Dialog */}
        {showInviteDialog && tenant?.id && (
          <InviteDialog
            onClose={() => setShowInviteDialog(false)}
            onInvite={() => {
              setShowInviteDialog(false);
              queryClient.invalidateQueries({ queryKey: ['workspace-members'] });
            }}
            workspaceId={tenant.id}
          />
        )}
      </AppLayout>
    </ProtectedRoute>
  );
}

// Members Table Component
function MembersTable({
  members,
  onUpdateRole,
  onRemoveMember,
  isUpdatingRole,
  isRemovingMember,
}: {
  members: WorkspaceMember[];
  onUpdateRole: (userId: string, role: WorkspaceRole) => void;
  onRemoveMember: (userId: string) => void;
  isUpdatingRole: boolean;
  isRemovingMember: boolean;
}) {
  const columns: ColumnDef<WorkspaceMember>[] = [
    {
      accessorFn: (row) => row.user?.email,
      id: 'email',
      header: 'Email',
      cell: (info) => {
        const member = info.row.original;
        const fullName = member.user
          ? `${member.user.firstName || ''} ${member.user.lastName || ''}`.trim()
          : 'Unknown';
        return (
          <div>
            <p className="font-medium text-foreground">{fullName || member.user?.email}</p>
            <p className="text-xs text-muted-foreground">{member.user?.email}</p>
          </div>
        );
      },
    },
    {
      accessorKey: 'role',
      header: 'Role',
      cell: (info) => {
        const member = info.row.original;
        return (
          <SearchableSelect
            value={member.role}
            onChange={(role) => onUpdateRole(member.userId, role as WorkspaceRole)}
            options={[
              { value: 'ADMIN', label: 'Admin' },
              { value: 'MEMBER', label: 'Member' },
              { value: 'VIEWER', label: 'Viewer' },
            ]}
            placeholder="Select role"
            disabled={isUpdatingRole}
          />
        );
      },
    },
    {
      accessorFn: (row) => new Date(row.joinedAt).toLocaleDateString(),
      id: 'joinedAt',
      header: 'Joined',
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: (info) => {
        const member = info.row.original;
        return (
          <Button
            onClick={() => onRemoveMember(member.userId)}
            disabled={isRemovingMember}
            variant="destructive"
            size="sm"
          >
            {isRemovingMember ? '...' : 'Remove'}
          </Button>
        );
      },
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={members}
      isLoading={false}
      enableSorting
      enableColumnFilters
      enableGlobalFilter
      enablePagination
      pageSize={10}
    />
  );
}

// Invite Dialog Component
function InviteDialog({
  onClose,
  onInvite,
  workspaceId,
}: {
  onClose: () => void;
  onInvite: () => void;
  workspaceId: string;
}) {
  const queryClient = useQueryClient();

  const inviteSchema = z.object({
    email: z.string().email('Invalid email address'),
    role: z.enum(['ADMIN', 'MEMBER', 'VIEWER']),
  });

  const { values, errors, isSubmitting, handleChange, handleSubmit } = useForm({
    initialValues: {
      email: '',
      role: 'MEMBER' as WorkspaceRole,
    },
    validationSchema: inviteSchema,
    onSubmit: async (formValues) => {
      try {
        await apiClient.addWorkspaceMember(workspaceId, {
          userId: formValues.email,
          role: formValues.role,
        });
        toast.success('Member invited successfully');
        queryClient.invalidateQueries({ queryKey: ['workspace-members'] });
        onInvite();
      } catch {
        toast.error('Failed to invite member');
      }
    },
  });

  const handleSelectChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const { name, value } = e.target;
    handleChange({ target: { name, value } } as any);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card border border-border rounded-lg p-6 max-w-md w-full mx-4">
        <h2 className="text-lg font-semibold text-foreground mb-4">Invite Member</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email Input */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Email Address</label>
            <input
              type="email"
              name="email"
              value={values.email}
              onChange={handleChange}
              placeholder="member@example.com"
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {errors.email && <p className="text-sm text-destructive mt-1">{errors.email}</p>}
          </div>

          {/* Role Select */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Role</label>
            <select
              name="role"
              value={values.role}
              onChange={handleSelectChange}
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="MEMBER">Member</option>
              <option value="ADMIN">Admin</option>
              <option value="VIEWER">Viewer</option>
            </select>
            {errors.role && <p className="text-sm text-destructive mt-1">{errors.role}</p>}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-4">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={isSubmitting}>
              {isSubmitting ? 'Inviting...' : 'Invite'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
