// File: apps/web/src/routes/workspace-settings.tsx

import { createFileRoute } from '@tanstack/react-router';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { AppLayout } from '../components/Layout';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { useState, useEffect } from 'react';
import { useAuthStore } from '../stores/auth-store';
import { apiClient } from '../lib/api-client';
import type { WorkspaceMember, Team } from '../types';

export const Route = createFileRoute('/workspace-settings')({
  component: WorkspaceSettingsPage,
});

type SettingsTab = 'general' | 'members' | 'teams';

function WorkspaceSettingsPage() {
  const { currentWorkspace, updateWorkspace, deleteWorkspace, isAdmin } = useWorkspace();
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');

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
        <div className="flex items-center gap-2 mb-6 border-b border-border">
          <TabButton
            label="General"
            active={activeTab === 'general'}
            onClick={() => setActiveTab('general')}
          />
          <TabButton
            label="Members"
            active={activeTab === 'members'}
            onClick={() => setActiveTab('members')}
          />
          <TabButton
            label="Teams"
            active={activeTab === 'teams'}
            onClick={() => setActiveTab('teams')}
          />
        </div>

        {/* Tab Content */}
        <div className="max-w-4xl">
          {activeTab === 'general' && (
            <GeneralTab
              workspace={currentWorkspace}
              onUpdate={updateWorkspace}
              onDelete={deleteWorkspace}
              isAdmin={isAdmin}
            />
          )}
          {activeTab === 'members' && (
            <MembersTab
              workspaceId={currentWorkspace.id}
              currentUserId={user?.id || ''}
              isAdmin={isAdmin}
            />
          )}
          {activeTab === 'teams' && <TeamsTab workspaceId={currentWorkspace.id} />}
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
}

// Tab Button Component
interface TabButtonProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

function TabButton({ label, active, onClick }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 font-medium transition-colors border-b-2 ${
        active
          ? 'text-primary border-primary'
          : 'text-muted-foreground border-transparent hover:text-foreground'
      }`}
    >
      {label}
    </button>
  );
}

// General Tab
interface GeneralTabProps {
  workspace: any;
  onUpdate: (workspaceId: string, data: any) => Promise<void>;
  onDelete: (workspaceId: string) => Promise<void>;
  isAdmin: boolean;
}

function GeneralTab({ workspace, onUpdate, onDelete, isAdmin }: GeneralTabProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [formData, setFormData] = useState({
    name: workspace.name,
    description: workspace.description || '',
  });
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setError(null);
      await onUpdate(workspace.id, formData);
      setIsEditing(false);
    } catch (err: any) {
      setError(err.message || 'Failed to update workspace');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      await onDelete(workspace.id);
      // Redirect handled by workspace context
    } catch (err: any) {
      setError(err.message || 'Failed to delete workspace');
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Workspace Info */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">Workspace Information</h2>

        {error && (
          <div className="mb-4 p-3 bg-destructive/10 border border-destructive rounded-lg text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Workspace Name</label>
            {isEditing && isAdmin ? (
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            ) : (
              <p className="text-muted-foreground">{workspace.name}</p>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Description</label>
            {isEditing && isAdmin ? (
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            ) : (
              <p className="text-muted-foreground">{workspace.description || 'No description'}</p>
            )}
          </div>

          {/* Slug (read-only) */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Slug</label>
            <p className="text-muted-foreground font-mono text-sm">{workspace.slug}</p>
          </div>

          {/* Created Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Created</label>
              <p className="text-muted-foreground text-sm">
                {new Date(workspace.createdAt).toLocaleDateString()}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Your Role</label>
              <span
                className={`inline-block px-2 py-1 text-xs rounded ${
                  workspace.memberRole === 'ADMIN'
                    ? 'bg-primary/20 text-primary'
                    : workspace.memberRole === 'MEMBER'
                      ? 'bg-blue-500/20 text-blue-600'
                      : 'bg-muted text-muted-foreground'
                }`}
              >
                {workspace.memberRole}
              </span>
            </div>
          </div>

          {/* Edit Actions */}
          {isAdmin && (
            <div className="flex gap-2 pt-4">
              {!isEditing ? (
                <button
                  onClick={() => setIsEditing(true)}
                  className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
                >
                  Edit Workspace
                </button>
              ) : (
                <>
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {isSaving ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button
                    onClick={() => {
                      setIsEditing(false);
                      setFormData({
                        name: workspace.name,
                        description: workspace.description || '',
                      });
                      setError(null);
                    }}
                    className="px-4 py-2 bg-muted text-foreground rounded-lg hover:bg-muted/80 transition-colors"
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          )}
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
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="px-4 py-2 bg-destructive text-white rounded-lg hover:bg-destructive/90 transition-colors"
            >
              Delete Workspace
            </button>
          ) : (
            <div className="space-y-3">
              <p className="text-sm font-medium text-foreground">
                Are you absolutely sure? This action cannot be undone.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="px-4 py-2 bg-destructive text-white rounded-lg hover:bg-destructive/90 transition-colors disabled:opacity-50"
                >
                  {isDeleting ? 'Deleting...' : 'Yes, Delete Workspace'}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-4 py-2 bg-muted text-foreground rounded-lg hover:bg-muted/80 transition-colors"
                >
                  Cancel
                </button>
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
              <span
                className={`px-2 py-1 text-xs rounded ${
                  member.role === 'ADMIN'
                    ? 'bg-primary/20 text-primary'
                    : member.role === 'MEMBER'
                      ? 'bg-blue-500/20 text-blue-600'
                      : 'bg-muted text-muted-foreground'
                }`}
              >
                {member.role}
              </span>

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
