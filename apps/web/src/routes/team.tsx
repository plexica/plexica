import { createFileRoute } from '@tanstack/react-router';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { AppLayout } from '../components/Layout';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../lib/api-client';
import { Button } from '@plexica/ui';
import { Input } from '@plexica/ui';
import { Textarea } from '@plexica/ui';
import { Label } from '@plexica/ui';
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
import { z } from 'zod';
import type { Team } from '../types';

export const Route = createFileRoute('/team')({
  component: TeamPage,
});

// Validation schema for create team form
const createTeamSchema = z.object({
  name: z.string().min(1, 'Team name is required').max(100, 'Name must be 100 characters or less'),
  description: z.string().max(500, 'Description must be 500 characters or less').optional(),
});

function TeamPage() {
  const { currentWorkspace } = useWorkspace();
  const [teams, setTeams] = useState<Team[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  const loadTeams = useCallback(async () => {
    if (!currentWorkspace) return;

    try {
      setIsLoading(true);
      setError(null);
      const data = await apiClient.getWorkspaceTeams(currentWorkspace.id);
      setTeams(data);
    } catch (err: unknown) {
      console.error('Failed to load teams:', err);
      const error = err as { response?: { data?: { message?: string } } };
      setError(error.response?.data?.message || 'Failed to load teams');
    } finally {
      setIsLoading(false);
    }
  }, [currentWorkspace]);

  // Load teams when workspace changes
  useEffect(() => {
    if (currentWorkspace) {
      loadTeams();
    } else {
      setTeams([]);
      setIsLoading(false);
    }
  }, [currentWorkspace, loadTeams]);

  // Filter teams
  const filteredTeams = teams.filter(
    (team) =>
      team.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (team.description && team.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Show workspace selection prompt if no workspace selected
  if (!currentWorkspace) {
    return (
      <ProtectedRoute>
        <AppLayout>
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center max-w-md">
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
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
              <h2 className="text-xl font-semibold text-foreground mb-2">No Workspace Selected</h2>
              <p className="text-muted-foreground mb-4">
                Please select a workspace from the switcher in the header to view teams.
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
        {/* Header with Breadcrumb */}
        <div className="mb-8">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
            <span className="hover:text-foreground cursor-pointer">Dashboard</span>
            <span>›</span>
            <span className="text-primary font-medium">{currentWorkspace.name}</span>
            <span>›</span>
            <span className="text-foreground">Teams</span>
          </div>

          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-foreground mb-2">Teams</h1>
              <p className="text-muted-foreground">
                Manage teams in{' '}
                <span className="font-medium text-foreground">{currentWorkspace.name}</span>{' '}
                workspace
              </p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors font-medium flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              Create Team
            </button>
          </div>

          {/* Workspace Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary/10 border border-primary/20 rounded-lg">
            <svg
              className="w-4 h-4 text-primary"
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
            <span className="text-sm font-medium text-primary">{currentWorkspace.name}</span>
            <span className="text-xs text-primary/70">
              • {teams.length} team{teams.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Search */}
        <div className="bg-card border border-border rounded-lg p-4 mb-6">
          <input
            type="text"
            placeholder="Search teams by name or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 bg-muted border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-border border-t-primary rounded-full animate-spin" />
          </div>
        )}

        {/* Error State */}
        {error && !isLoading && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Teams Grid */}
        {!isLoading && !error && (
          <>
            {filteredTeams.length > 0 ? (
              <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                {filteredTeams.map((team) => (
                  <TeamCard key={team.id} team={team} onUpdate={loadTeams} />
                ))}
              </div>
            ) : (
              <div className="bg-card border border-border rounded-lg p-12 text-center">
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
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  {searchQuery ? 'No teams found' : 'No teams yet'}
                </h3>
                <p className="text-muted-foreground mb-6">
                  {searchQuery
                    ? 'Try adjusting your search query'
                    : `Get started by creating your first team in ${currentWorkspace.name}`}
                </p>
                {!searchQuery && (
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors font-medium"
                  >
                    Create Your First Team
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {/* Create Team Dialog */}
        <CreateTeamDialog
          open={showCreateModal}
          onOpenChange={setShowCreateModal}
          workspaceId={currentWorkspace.id}
          workspaceName={currentWorkspace.name}
          onSuccess={loadTeams}
        />
      </AppLayout>
    </ProtectedRoute>
  );
}

// Team Card Component
interface TeamCardProps {
  team: Team;
  onUpdate: () => void;
}

function TeamCard({ team, onUpdate: _onUpdate }: TeamCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div className="bg-card border border-border rounded-lg p-6 hover:border-primary transition-colors group">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-foreground mb-1 group-hover:text-primary transition-colors">
            {team.name}
          </h3>
          {team.description && (
            <p className={`text-sm text-muted-foreground ${expanded ? '' : 'line-clamp-2'}`}>
              {team.description}
            </p>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
        <div className="flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
            />
          </svg>
          <span>{team._count?.members || 0} members</span>
        </div>
      </div>

      {/* Created Date */}
      <div className="text-xs text-muted-foreground mb-4">
        Created {new Date(team.createdAt).toLocaleDateString()}
      </div>

      {/* Expanded Detail */}
      {expanded && (
        <div className="mb-4 p-3 bg-muted rounded-lg space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Team ID</span>
            <span className="font-mono text-xs text-foreground">{team.id}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Members</span>
            <span className="text-foreground">{team._count?.members || 0}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Created</span>
            <span className="text-foreground">{new Date(team.createdAt).toLocaleString()}</span>
          </div>
          {team.description && (
            <div className="pt-2 border-t border-border">
              <span className="text-muted-foreground block mb-1">Description</span>
              <p className="text-foreground">{team.description}</p>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button className="flex-1" onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Collapse' : 'View Team'}
        </Button>
        <div className="relative">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setShowMenu(!showMenu)}
            onBlur={() => setTimeout(() => setShowMenu(false), 150)}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
              />
            </svg>
          </Button>
          {showMenu && (
            <div className="absolute right-0 top-full mt-1 w-36 bg-card border border-border rounded-lg shadow-lg z-10 py-1">
              <button
                onClick={() => {
                  setShowMenu(false);
                  toast.info('Team deletion is coming soon');
                }}
                className="w-full text-left px-3 py-2 text-sm text-destructive hover:bg-muted transition-colors"
              >
                Delete Team
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Create Team Dialog Component
interface CreateTeamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  workspaceName: string;
  onSuccess: () => void;
}

function CreateTeamDialog({
  open,
  onOpenChange,
  workspaceId,
  workspaceName,
  onSuccess,
}: CreateTeamDialogProps) {
  const { values, errors, isSubmitting, handleChange, handleSubmit } = useForm({
    initialValues: {
      name: '',
      description: '',
    },
    validationSchema: createTeamSchema,
    onSubmit: async (_formValues) => {
      try {
        await apiClient.createTeam({
          name: values.name.trim(),
          description: values.description?.trim() || undefined,
          workspaceId,
        });

        toast.success('Team created successfully!');
        onSuccess();
        onOpenChange(false);
      } catch (err: any) {
        toast.error(err.response?.data?.message || 'Failed to create team');
      }
    },
  });

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      // Reset form when closing
      onOpenChange(newOpen);
    } else {
      onOpenChange(newOpen);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create New Team</DialogTitle>
          <DialogDescription>Add a new team to {workspaceName} workspace</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Workspace Info */}
          <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg">
            <p className="text-sm text-primary">
              <span className="font-medium">Workspace:</span> {workspaceName}
            </p>
          </div>

          {/* Team Name */}
          <div>
            <Label htmlFor="name">Team Name *</Label>
            <Input
              id="name"
              name="name"
              value={values.name}
              onChange={handleChange}
              required
              placeholder="e.g., Engineering, Marketing, Sales"
              disabled={isSubmitting}
              className="mt-2"
            />
            {errors.name && (
              <Alert variant="destructive" className="mt-2 py-2">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-sm">{errors.name}</AlertDescription>
              </Alert>
            )}
          </div>

          {/* Description */}
          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              value={values.description || ''}
              onChange={handleChange}
              placeholder="What is this team for?"
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
          </div>

          {/* Actions */}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create Team'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
