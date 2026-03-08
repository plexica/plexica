// File: apps/web/src/components/WorkspaceSwitcher.tsx

import React, { useState } from 'react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useQueryClient } from '@tanstack/react-query';
import { logger } from '@/lib/logger';
import { Button } from '@plexica/ui';
import { Input } from '@plexica/ui';
import { Badge } from '@plexica/ui';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@plexica/ui';
import { Plus, Check } from 'lucide-react';
import type { Workspace } from '@/types';

interface WorkspaceSwitcherProps {
  className?: string;
  showCreateButton?: boolean;
}

export const WorkspaceSwitcher: React.FC<WorkspaceSwitcherProps> = ({
  className = '',
  showCreateButton = true,
}) => {
  const { workspaces, currentWorkspace, isLoading, selectWorkspace, createWorkspace } =
    useWorkspace();
  const queryClient = useQueryClient();

  const [isCreating, setIsCreating] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [error, setError] = useState<string | null>(null);
  // T8.7: search query — only shown when workspace count > 5
  const [searchQuery, setSearchQuery] = useState('');

  const handleSelectWorkspace = async (workspace: Workspace) => {
    if (workspace.id === currentWorkspace?.id) return; // Already selected
    try {
      await selectWorkspace(workspace.id);
      // Invalidate all workspace-scoped queries to force refetch with new workspace context
      queryClient.invalidateQueries({ queryKey: ['workspace-members'] });
      queryClient.invalidateQueries({ queryKey: ['workspace-teams'] });
    } catch (err: unknown) {
      logger.error({ err }, 'Failed to select workspace');
    }
  };

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newWorkspaceName.trim()) {
      setError('Workspace name is required');
      return;
    }

    try {
      setError(null);

      // Generate slug from name
      const slug = newWorkspaceName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

      await createWorkspace({
        name: newWorkspaceName.trim(),
        slug,
      });

      // Reset form and close
      setNewWorkspaceName('');
      setIsCreating(false);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string };
      setError(e.response?.data?.message || 'Failed to create workspace');
    }
  };

  const showSearch = workspaces.length > 5;
  const filteredWorkspaces =
    showSearch && searchQuery.trim()
      ? workspaces.filter(
          (w) =>
            w.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            w.slug.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : workspaces;

  if (isLoading) {
    return (
      <div className={`flex items-center gap-2 px-3 py-2 ${className}`}>
        <div className="w-5 h-5 border-2 border-border border-t-primary rounded-full animate-spin" />
        <span className="text-sm text-muted-foreground">Loading workspaces...</span>
      </div>
    );
  }

  if (workspaces.length === 0) {
    return (
      <div className={`flex items-center gap-2 px-3 py-2 ${className}`}>
        <svg
          className="w-5 h-5 text-muted-foreground"
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
        <span className="text-sm text-muted-foreground">No workspaces</span>
      </div>
    );
  }

  return (
    <DropdownMenu data-workspace-switcher="">
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          aria-label={`Switch workspace${currentWorkspace ? `, current: ${currentWorkspace.name}` : ''}`}
          className={`flex items-center gap-2 px-3 py-2 min-w-[200px] max-w-[300px] justify-start ${className}`}
        >
          {/* Workspace Icon */}
          <svg
            className="w-5 h-5 text-muted-foreground flex-shrink-0"
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

          {/* Workspace Name */}
          <div className="flex-1 text-left overflow-hidden">
            <p className="text-sm font-medium text-foreground truncate">
              {currentWorkspace?.name || 'Select workspace'}
            </p>
            {currentWorkspace?.memberRole && (
              <p className="text-xs text-muted-foreground">{currentWorkspace.memberRole}</p>
            )}
          </div>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-80">
        {/* Header */}
        <DropdownMenuLabel>
          <div className="space-y-1">
            <p className="text-sm font-semibold">Workspaces</p>
            <p className="text-xs text-muted-foreground">
              {workspaces.length} workspace{workspaces.length !== 1 ? 's' : ''} available
            </p>
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        {/* T8.7: Search filter — shown only when workspace count > 5 */}
        {showSearch && (
          <div className="px-2 pb-2">
            <Input
              type="search"
              placeholder="Search workspaces…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 text-sm"
              aria-label="Search workspaces"
              aria-controls="workspace-list"
            />
            {/* T9.1: live region announces how many results match */}
            <span role="status" aria-live="polite" aria-atomic="true" className="sr-only">
              {filteredWorkspaces.length} workspace{filteredWorkspaces.length !== 1 ? 's' : ''}{' '}
              found
            </span>
          </div>
        )}

        {/* T9.1: Workspace List */}
        <div id="workspace-list" className="max-h-[300px] overflow-y-auto">
          {filteredWorkspaces.map((workspace) => (
            <DropdownMenuItem
              key={workspace.id}
              aria-current={currentWorkspace?.id === workspace.id ? 'true' : undefined}
              onClick={() => handleSelectWorkspace(workspace)}
              className="flex items-start justify-between gap-2 py-3"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{workspace.name}</p>
                {workspace.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {workspace.description}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <Badge
                    variant={workspace.memberRole === 'ADMIN' ? 'default' : 'secondary'}
                    className="text-xs"
                  >
                    {workspace.memberRole}
                  </Badge>
                  {workspace._count && (
                    <span className="text-xs text-muted-foreground">
                      {workspace._count.teams} team{workspace._count.teams !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>

              {/* Selected Indicator */}
              {currentWorkspace?.id === workspace.id && (
                <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
              )}
            </DropdownMenuItem>
          ))}
        </div>

        {/* Create New Workspace */}
        {showCreateButton && (
          <>
            <DropdownMenuSeparator />

            {!isCreating ? (
              <DropdownMenuItem
                onClick={() => setIsCreating(true)}
                className="text-primary flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Create New Workspace
              </DropdownMenuItem>
            ) : (
              <div className="p-3 space-y-2">
                <form onSubmit={handleCreateWorkspace} className="space-y-2">
                  <Input
                    type="text"
                    value={newWorkspaceName}
                    onChange={(e) => {
                      setNewWorkspaceName(e.target.value);
                      setError(null);
                    }}
                    placeholder="Workspace name"
                    autoFocus
                    className="text-sm"
                  />
                  {error && <p className="text-xs text-destructive">{error}</p>}
                  <div className="flex gap-2">
                    <Button
                      type="submit"
                      size="sm"
                      className="flex-1"
                      aria-label="Create workspace"
                    >
                      Create
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-label="Cancel creating workspace"
                      onClick={() => {
                        setIsCreating(false);
                        setNewWorkspaceName('');
                        setError(null);
                      }}
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              </div>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
