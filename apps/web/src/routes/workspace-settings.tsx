// File: apps/web/src/routes/workspace-settings.tsx

import { createFileRoute } from '@tanstack/react-router';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { AppLayout } from '../components/Layout';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { useState, useEffect } from 'react';
import { useAuthStore } from '../stores/auth-store';
import { apiClient } from '../lib/api-client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@plexica/ui';
import { Badge } from '@plexica/ui';
import { Input } from '@plexica/ui';
import { Textarea } from '@plexica/ui';
import { Button } from '@plexica/ui';
import { Label } from '@plexica/ui';
import { Alert, AlertDescription } from '@plexica/ui';
import { AlertCircle } from 'lucide-react';
import { useForm } from '@/hooks/useForm';
import { toast } from '@/components/ToastProvider';
import { z } from 'zod';
import type { WorkspaceMember, Team } from '../types';

export const Route = createFileRoute('/workspace-settings')({
  component: WorkspaceSettingsPage,
});

function WorkspaceSettingsPage() {
  const { currentWorkspace, updateWorkspace, deleteWorkspace, isAdmin } = useWorkspace();
  const { user } = useAuthStore();

  if (!currentWorkspace) {
    return (
      <ProtectedRoute>
        <AppLayout>
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <svg
                className="w-16 h-16 mx-auto text-muted-foreground mb-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                />
              </svg>
              <h2 className="text-xl font-semibold text-foreground mb-2">No Workspace Selected</h2>
              <p className="text-muted-foreground">
                Please select a workspace from the switcher above.
              </p>
            </div>
          </div>
        </AppLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <AppLayout>
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Workspace Settings</h1>
          <p className="text-muted-foreground">
            Manage {currentWorkspace.name} workspace settings and members
          </p>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="general" className="max-w-4xl">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="members">Members</TabsTrigger>
            <TabsTrigger value="teams">Teams</TabsTrigger>
          </TabsList>

          {/* Tab Content */}
          <TabsContent value="general" className="mt-6">
            <GeneralTab
              workspace={currentWorkspace}
              onUpdate={updateWorkspace}
              onDelete={deleteWorkspace}
              isAdmin={isAdmin}
            />
          </TabsContent>
          <TabsContent value="members" className="mt-6">
            <MembersTab
              workspaceId={currentWorkspace.id}
              currentUserId={user?.id || ''}
              isAdmin={isAdmin}
            />
          </TabsContent>
          <TabsContent value="teams" className="mt-6">
            <TeamsTab workspaceId={currentWorkspace.id} />
          </TabsContent>
        </Tabs>
      </AppLayout>
    </ProtectedRoute>
  );
}

// General Tab
interface GeneralTabProps {
  workspace: any;
  onUpdate: (workspaceId: string, data: any) => Promise<void>;
  onDelete: (workspaceId: string) => Promise<void>;
  isAdmin: boolean;
}

// Validation schema for workspace settings
const workspaceSettingsSchema = z.object({
  name: z
    .string()
    .min(1, 'Workspace name is required')
    .max(100, 'Name must be 100 characters or less'),
  description: z.string().max(500, 'Description must be 500 characters or less').optional(),
});

function GeneralTab({ workspace, onUpdate, onDelete, isAdmin }: GeneralTabProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const { values, errors, isSubmitting, handleChange, handleSubmit } = useForm({
    initialValues: {
      name: workspace.name,
      description: workspace.description || '',
    },
    validationSchema: workspaceSettingsSchema,
    onSubmit: async (_formValues) => {
      try {
        await onUpdate(workspace.id, values);
        toast.success('Workspace updated successfully!');
        setIsEditing(false);
      } catch (err: any) {
        toast.error(err.message || 'Failed to update workspace');
      }
    },
  });

  return (
    <div className="space-y-6">
      {/* Workspace Info */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">Workspace Information</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <Label htmlFor="name">Workspace Name</Label>
            {isEditing && isAdmin ? (
              <>
                <Input
                  id="name"
                  name="name"
                  type="text"
                  value={values.name}
                  onChange={handleChange}
                  disabled={isSubmitting}
                  className="mt-2"
                />
                {errors.name && (
                  <Alert variant="destructive" className="mt-2 py-2">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-sm">{errors.name}</AlertDescription>
                  </Alert>
                )}
              </>
            ) : (
              <p className="text-muted-foreground mt-2">{workspace.name}</p>
            )}
          </div>

          {/* Description */}
          <div>
            <Label htmlFor="description">Description</Label>
            {isEditing && isAdmin ? (
              <>
                <Textarea
                  id="description"
                  name="description"
                  value={values.description || ''}
                  onChange={handleChange}
                  disabled={isSubmitting}
                  rows={3}
                  className="mt-2"
                />
                {errors.description && (
                  <Alert variant="destructive" className="mt-2 py-2">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-sm">{errors.description}</AlertDescription>
                  </Alert>
                )}
              </>
            ) : (
              <p className="text-muted-foreground mt-2">
                {workspace.description || 'No description'}
              </p>
            )}
          </div>

          {/* Slug (read-only) */}
          <div>
            <Label>Slug</Label>
            <p className="text-muted-foreground font-mono text-sm">{workspace.slug}</p>
          </div>

          {/* Created Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Created</Label>
              <p className="text-muted-foreground text-sm">
                {new Date(workspace.createdAt).toLocaleDateString()}
              </p>
            </div>
            <div>
              <Label>Your Role</Label>
              <Badge
                variant={
                  workspace.memberRole === 'ADMIN'
                    ? 'default'
                    : workspace.memberRole === 'MEMBER'
                      ? 'secondary'
                      : 'outline'
                }
              >
                {workspace.memberRole}
              </Badge>
            </div>
          </div>

          {/* Edit Actions */}
          {isAdmin && (
            <div className="flex gap-2 pt-4">
              {!isEditing ? (
                <Button onClick={() => setIsEditing(true)} type="button">
                  Edit Workspace
                </Button>
              ) : (
                <>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? 'Saving...' : 'Save Changes'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setIsEditing(false)}
                    disabled={isSubmitting}
                    type="button"
                  >
                    Cancel
                  </Button>
                </>
              )}
            </div>
          )}
        </form>
      </div>

      {/* Danger Zone */}
      {isAdmin && (
        <div className="bg-card border border-destructive/50 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-destructive mb-2">Danger Zone</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Deleting a workspace is permanent and cannot be undone. All teams and data will be lost.
          </p>

          {!showDeleteConfirm ? (
            <Button variant="destructive" onClick={() => setShowDeleteConfirm(true)} type="button">
              Delete Workspace
            </Button>
          ) : (
            <div className="space-y-3">
              <p className="text-sm font-medium text-foreground">
                Are you absolutely sure? This action cannot be undone.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  onClick={async () => {
                    try {
                      await onDelete(workspace.id);
                    } catch (err: any) {
                      toast.error(err.message || 'Failed to delete workspace');
                      setShowDeleteConfirm(false);
                    }
                  }}
                  type="button"
                >
                  Yes, Delete Workspace
                </Button>
                <Button variant="outline" onClick={() => setShowDeleteConfirm(false)} type="button">
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Members Tab
interface MembersTabProps {
  workspaceId: string;
  currentUserId: string;
  isAdmin: boolean;
}

function MembersTab({ workspaceId, currentUserId, isAdmin }: MembersTabProps) {
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadMembers();
  }, [workspaceId]);

  const loadMembers = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await apiClient.getWorkspaceMembers(workspaceId);
      setMembers(data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load members');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!isAdmin || !confirm('Are you sure you want to remove this member?')) return;

    try {
      await apiClient.removeWorkspaceMember(workspaceId, userId);
      await loadMembers();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to remove member');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-border border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-destructive/10 border border-destructive rounded-lg text-destructive">
        {error}
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-foreground">Members ({members.length})</h2>
        {isAdmin && (
          <button className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors">
            Add Member
          </button>
        )}
      </div>

      <div className="space-y-2">
        {members.map((member) => (
          <div
            key={member.userId}
            className="flex items-center justify-between p-3 hover:bg-muted rounded-lg transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center text-white font-medium">
                {member.user?.firstName?.[0] || member.user?.email[0].toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  {member.user?.firstName} {member.user?.lastName}
                  {member.userId === currentUserId && (
                    <span className="ml-2 text-xs text-muted-foreground">(You)</span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">{member.user?.email}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Badge
                variant={
                  member.role === 'ADMIN'
                    ? 'default'
                    : member.role === 'MEMBER'
                      ? 'secondary'
                      : 'outline'
                }
              >
                {member.role}
              </Badge>

              {isAdmin && member.userId !== currentUserId && (
                <button
                  onClick={() => handleRemoveMember(member.userId)}
                  className="text-destructive hover:text-destructive/80 text-sm"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        ))}

        {members.length === 0 && (
          <p className="text-center text-muted-foreground py-8">No members found</p>
        )}
      </div>
    </div>
  );
}

// Teams Tab
interface TeamsTabProps {
  workspaceId: string;
}

function TeamsTab({ workspaceId }: TeamsTabProps) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTeams();
  }, [workspaceId]);

  const loadTeams = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await apiClient.getWorkspaceTeams(workspaceId);
      setTeams(data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load teams');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-border border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-destructive/10 border border-destructive rounded-lg text-destructive">
        {error}
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-foreground">Teams ({teams.length})</h2>
      </div>

      <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
        {teams.map((team) => (
          <div
            key={team.id}
            className="p-4 border border-border rounded-lg hover:border-primary transition-colors"
          >
            <h3 className="font-medium text-foreground mb-1">{team.name}</h3>
            {team.description && (
              <p className="text-sm text-muted-foreground mb-2">{team.description}</p>
            )}
            <p className="text-xs text-muted-foreground">
              {team._count?.members || 0} member{team._count?.members !== 1 ? 's' : ''}
            </p>
          </div>
        ))}

        {teams.length === 0 && (
          <div className="col-span-2 text-center py-8">
            <p className="text-muted-foreground">No teams in this workspace yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
