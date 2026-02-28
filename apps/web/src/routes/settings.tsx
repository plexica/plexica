// apps/web/src/routes/settings.tsx

import { createFileRoute } from '@tanstack/react-router';
import { useState, useEffect, useCallback } from 'react';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { AppLayout } from '../components/Layout';
import { useAuthStore } from '../stores/auth-store';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { apiClient } from '../lib/api-client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@plexica/ui';
import { Switch } from '@plexica/ui';
import { Input } from '@plexica/ui';
import { Label } from '@plexica/ui';
import { Textarea } from '@plexica/ui';
import { Button } from '@plexica/ui';
import { Badge } from '@plexica/ui';
import { Alert, AlertDescription } from '@plexica/ui';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@plexica/ui';
import { AlertCircle } from 'lucide-react';
import { useForm } from '@/hooks/useForm';
import { toast } from '@/components/ToastProvider';
import { useFeatureFlag } from '@/lib/feature-flags';
import { BrandingTab } from './settings.branding';
import { z } from 'zod';
import type { WorkspaceMember, Team } from '../types';

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = useAuthStore();
  const { currentWorkspace, updateWorkspace, deleteWorkspace, isAdmin } = useWorkspace();

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
            Manage {currentWorkspace.name} workspace settings and configuration
          </p>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="general" className="max-w-4xl">
          <SettingsTabsList />

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
          <TabsContent value="security" className="mt-6">
            <ComingSoonTab
              icon="lock"
              title="Security Settings"
              description="Two-factor authentication, password policies, access control, and API key management."
              note="Security is currently managed through your identity provider (Keycloak)."
            />
          </TabsContent>
          <TabsContent value="billing" className="mt-6">
            <ComingSoonTab
              icon="card"
              title="Billing & Subscription"
              description="Plan management, usage tracking, payment methods, and billing history."
            />
          </TabsContent>
          <TabsContent value="integrations" className="mt-6">
            <ComingSoonTab
              icon="link"
              title="Integrations"
              description="Connect your workspace with external services like Slack, GitHub, Google Workspace, and more."
            />
          </TabsContent>
          <TabsContent value="advanced" className="mt-6">
            <ComingSoonTab
              icon="wrench"
              title="Advanced Settings"
              description="Data export, workspace transfer, debug mode, and developer options."
            />
          </TabsContent>
          {/* Branding tab — only rendered when ENABLE_TENANT_THEMING is on */}
          <TabsContent value="branding" className="mt-6">
            <BrandingTab />
          </TabsContent>
        </Tabs>
      </AppLayout>
    </ProtectedRoute>
  );
}

// ─── Settings Tabs List ───────────────────────────────────────────────────────

/**
 * Renders the TabsList. Branding trigger is shown only when
 * ENABLE_TENANT_THEMING feature flag is on.
 */
function SettingsTabsList() {
  const brandingEnabled = useFeatureFlag('ENABLE_TENANT_THEMING');

  return (
    <TabsList className={`grid w-full ${brandingEnabled ? 'grid-cols-8' : 'grid-cols-7'}`}>
      <TabsTrigger value="general">General</TabsTrigger>
      <TabsTrigger value="members">Members</TabsTrigger>
      <TabsTrigger value="teams">Teams</TabsTrigger>
      <TabsTrigger value="security">Security</TabsTrigger>
      <TabsTrigger value="billing">Billing</TabsTrigger>
      <TabsTrigger value="integrations">Integrations</TabsTrigger>
      <TabsTrigger value="advanced">Advanced</TabsTrigger>
      {brandingEnabled && <TabsTrigger value="branding">Branding</TabsTrigger>}
    </TabsList>
  );
}

// ─── General Tab ──────────────────────────────────────────────────────────────

interface GeneralTabProps {
  workspace: any;
  onUpdate: (workspaceId: string, data: any) => Promise<void>;
  onDelete: (workspaceId: string) => Promise<void>;
  isAdmin: boolean;
}

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

      {/* Preferences */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">Preferences</h2>
        <div className="space-y-4">
          <ToggleSetting
            label="Allow plugin installation"
            description="Members can browse and install plugins from the marketplace"
            defaultChecked={true}
          />
          <ToggleSetting
            label="Require approval for plugin installation"
            description="Admins must approve plugin installations"
            defaultChecked={false}
          />
          <ToggleSetting
            label="Email notifications"
            description="Send email notifications for important workspace events"
            defaultChecked={true}
          />
        </div>
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

// ─── Members Tab ──────────────────────────────────────────────────────────────

interface MembersTabProps {
  workspaceId: string;
  currentUserId: string;
  isAdmin: boolean;
}

function MembersTab({ workspaceId, currentUserId, isAdmin }: MembersTabProps) {
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddMember, setShowAddMember] = useState(false);

  const loadMembers = useCallback(async () => {
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
  }, [workspaceId]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const handleRemoveMember = async (userId: string) => {
    if (!isAdmin || !confirm('Are you sure you want to remove this member?')) return;

    try {
      await apiClient.removeWorkspaceMember(workspaceId, userId);
      toast.success('Member removed');
      await loadMembers();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to remove member');
    }
  };

  const handleUpdateRole = async (userId: string, role: string) => {
    if (!isAdmin) return;

    try {
      await apiClient.updateWorkspaceMemberRole(workspaceId, userId, {
        role: role as 'ADMIN' | 'MEMBER' | 'VIEWER',
      });
      toast.success('Member role updated');
      await loadMembers();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update role');
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
        {isAdmin && <Button onClick={() => setShowAddMember(true)}>Add Member</Button>}
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
              {isAdmin && member.userId !== currentUserId ? (
                <select
                  value={member.role}
                  onChange={(e) => handleUpdateRole(member.userId, e.target.value)}
                  className="text-xs px-2 py-1 border border-border rounded bg-background text-foreground"
                >
                  <option value="ADMIN">Admin</option>
                  <option value="MEMBER">Member</option>
                  <option value="VIEWER">Viewer</option>
                </select>
              ) : (
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
              )}

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

      {/* Add Member Dialog */}
      <AddMemberDialog
        open={showAddMember}
        onOpenChange={setShowAddMember}
        workspaceId={workspaceId}
        onSuccess={loadMembers}
      />
    </div>
  );
}

// ─── Add Member Dialog ────────────────────────────────────────────────────────

const addMemberSchema = z.object({
  email: z.string().email('Valid email address is required'),
  role: z.enum(['ADMIN', 'MEMBER', 'VIEWER']),
});

interface AddMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  onSuccess: () => void;
}

function AddMemberDialog({ open, onOpenChange, workspaceId, onSuccess }: AddMemberDialogProps) {
  const { values, errors, isSubmitting, handleChange, handleSubmit } = useForm({
    initialValues: {
      email: '',
      role: 'MEMBER' as 'ADMIN' | 'MEMBER' | 'VIEWER',
    },
    validationSchema: addMemberSchema,
    onSubmit: async (formValues) => {
      try {
        await apiClient.addWorkspaceMember(workspaceId, {
          userId: formValues.email,
          role: formValues.role,
        });
        toast.success('Member added successfully!');
        onSuccess();
        onOpenChange(false);
      } catch (err: any) {
        toast.error(err.response?.data?.message || 'Failed to add member');
      }
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Member</DialogTitle>
          <DialogDescription>Invite a user to this workspace by email address</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="add-email">Email Address</Label>
            <Input
              id="add-email"
              name="email"
              type="email"
              value={values.email}
              onChange={handleChange}
              placeholder="member@example.com"
              disabled={isSubmitting}
              className="mt-2"
            />
            {errors.email && (
              <Alert variant="destructive" className="mt-2 py-2">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-sm">{errors.email}</AlertDescription>
              </Alert>
            )}
          </div>

          <div>
            <Label htmlFor="add-role">Role</Label>
            <select
              id="add-role"
              name="role"
              value={values.role}
              onChange={(e) =>
                handleChange({ target: { name: 'role', value: e.target.value } } as any)
              }
              disabled={isSubmitting}
              className="w-full mt-2 px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="MEMBER">Member</option>
              <option value="ADMIN">Admin</option>
              <option value="VIEWER">Viewer</option>
            </select>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Adding...' : 'Add Member'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Teams Tab ────────────────────────────────────────────────────────────────

interface TeamsTabProps {
  workspaceId: string;
}

function TeamsTab({ workspaceId }: TeamsTabProps) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTeams = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await apiClient.getWorkspaceTeams(workspaceId);
      setTeams(data);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      setError(error.response?.data?.message || 'Failed to load teams');
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    loadTeams();
  }, [loadTeams]);

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

// ─── Coming Soon Placeholder ──────────────────────────────────────────────────

const ICONS: Record<string, string> = {
  lock: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z',
  card: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z',
  link: 'M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1',
  wrench:
    'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
};

function ComingSoonTab({
  icon,
  title,
  description,
  note,
}: {
  icon: string;
  title: string;
  description: string;
  note?: string;
}) {
  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-lg p-12 text-center">
        <svg
          className="w-12 h-12 mx-auto text-muted-foreground mb-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d={ICONS[icon] || ICONS.wrench}
          />
        </svg>
        <h2 className="text-xl font-semibold text-foreground mb-2">{title}</h2>
        <p className="text-sm text-muted-foreground mb-1">{description}</p>
        <p className="text-xs text-muted-foreground">{note || 'This feature is coming soon.'}</p>
      </div>
    </div>
  );
}

// ─── Helper Components ────────────────────────────────────────────────────────

function ToggleSetting({
  label,
  description,
  defaultChecked,
}: {
  label: string;
  description: string;
  defaultChecked: boolean;
}) {
  const [checked, setChecked] = useState(defaultChecked);

  return (
    <div className="flex items-center justify-between">
      <div className="flex-1">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={setChecked} />
    </div>
  );
}
