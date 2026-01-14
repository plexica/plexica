// File: apps/web/src/components/WorkspaceSwitcher.tsx

import React, { useState } from 'react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
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

  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSelectWorkspace = async (workspace: Workspace) => {
    try {
      await selectWorkspace(workspace.id);
      setIsOpen(false);
    } catch (err: any) {
      console.error('Failed to select workspace:', err);
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
      setIsOpen(false);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create workspace');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      setIsCreating(false);
      setNewWorkspaceName('');
      setError(null);
    }
  };

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
    <div className={`relative ${className}`}>
      {/* Workspace Selector Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        className="flex items-center gap-2 px-3 py-2 hover:bg-muted rounded-lg transition-colors min-w-[200px] max-w-[300px]"
        aria-label="Select workspace"
        aria-expanded={isOpen}
        aria-haspopup="true"
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

        {/* Dropdown Arrow */}
        <svg
          className={`w-4 h-4 text-muted-foreground transition-transform flex-shrink-0 ${
            isOpen ? 'rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => {
              setIsOpen(false);
              setIsCreating(false);
              setNewWorkspaceName('');
              setError(null);
            }}
          />

          {/* Menu */}
          <div className="absolute left-0 mt-2 w-80 bg-card border border-border rounded-lg shadow-lg z-20 max-h-[500px] flex flex-col">
            {/* Header */}
            <div className="p-3 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground">Workspaces</h3>
              <p className="text-xs text-muted-foreground mt-1">
                {workspaces.length} workspace{workspaces.length !== 1 ? 's' : ''} available
              </p>
            </div>

            {/* Workspace List */}
            <div className="overflow-y-auto flex-1">
              {workspaces.map((workspace) => (
                <button
                  key={workspace.id}
                  onClick={() => handleSelectWorkspace(workspace)}
                  className={`w-full px-4 py-3 text-left hover:bg-muted transition-colors border-l-2 ${
                    currentWorkspace?.id === workspace.id
                      ? 'border-primary bg-muted/50'
                      : 'border-transparent'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {workspace.name}
                      </p>
                      {workspace.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {workspace.description}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-1">
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded ${
                            workspace.memberRole === 'ADMIN'
                              ? 'bg-primary/20 text-primary'
                              : workspace.memberRole === 'MEMBER'
                                ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400'
                                : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {workspace.memberRole}
                        </span>
                        {workspace._count && (
                          <span className="text-xs text-muted-foreground">
                            {workspace._count.teams} team{workspace._count.teams !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Selected Indicator */}
                    {currentWorkspace?.id === workspace.id && (
                      <svg
                        className="w-5 h-5 text-primary flex-shrink-0"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </div>
                </button>
              ))}
            </div>

            {/* Create New Workspace */}
            {showCreateButton && (
              <div className="border-t border-border p-3">
                {!isCreating ? (
                  <button
                    onClick={() => setIsCreating(true)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/10 rounded-lg transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 4v16m8-8H4"
                      />
                    </svg>
                    Create New Workspace
                  </button>
                ) : (
                  <form onSubmit={handleCreateWorkspace} className="space-y-2">
                    <input
                      type="text"
                      value={newWorkspaceName}
                      onChange={(e) => {
                        setNewWorkspaceName(e.target.value);
                        setError(null);
                      }}
                      onKeyDown={handleKeyDown}
                      placeholder="Workspace name"
                      className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                      autoFocus
                    />
                    {error && <p className="text-xs text-destructive">{error}</p>}
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        className="flex-1 px-3 py-1.5 text-sm font-medium text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors"
                      >
                        Create
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsCreating(false);
                          setNewWorkspaceName('');
                          setError(null);
                        }}
                        className="flex-1 px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
