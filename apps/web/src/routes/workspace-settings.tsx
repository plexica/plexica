// apps/web/src/routes/workspace-settings.tsx
//
// T8.1 / T4 frontend: Full workspace settings page wiring WorkspaceSettingsForm.
// Previously a redirect stub — now renders the settings form for the current workspace.
// Constitution Art. 5.1 — editing is ADMIN-only (enforced inside WorkspaceSettingsForm).
// Constitution Art. 1.3 — WCAG 2.1 AA handled by WorkspaceSettingsForm toggles (T9.2).
// Spec 009 Appendix D: 4 fields only — defaultTeamRole, allowCrossWorkspaceSharing,
// maxMembers, isDiscoverable. No isPublic, no notificationsEnabled.

import { createFileRoute } from '@tanstack/react-router';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { WorkspaceSettingsForm } from '@/components/workspace/WorkspaceSettingsForm';
import {
  WorkspaceSettingsSchema,
  type WorkspaceSettings,
} from '@/components/workspace/workspace-settings.schema';
import { Skeleton } from '@plexica/ui';

// ---------------------------------------------------------------------------
// Default settings (used when workspace.settings is missing/incomplete)
// ---------------------------------------------------------------------------

const DEFAULT_SETTINGS: WorkspaceSettings = {
  defaultTeamRole: 'MEMBER',
  allowCrossWorkspaceSharing: false,
  maxMembers: 0,
  isDiscoverable: true,
};

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

function WorkspaceSettingsPage() {
  const { currentWorkspace, isAdmin, isLoading } = useWorkspace();

  if (isLoading) {
    return (
      <div className="p-6 space-y-4 max-w-2xl">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  if (!currentWorkspace) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center p-6">
        <p className="text-sm text-muted-foreground">No workspace selected</p>
      </div>
    );
  }

  // Merge stored settings over defaults — use Zod partial parse for safety.
  const initialSettings: WorkspaceSettings = {
    ...DEFAULT_SETTINGS,
    ...WorkspaceSettingsSchema.partial()
      .catch({})
      .parse(currentWorkspace.settings ?? {}),
  };

  return (
    <div className="p-6 space-y-4 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Workspace Settings</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configure behaviour for{' '}
          <span className="font-medium text-foreground">{currentWorkspace.name}</span>.
        </p>
      </div>

      <WorkspaceSettingsForm
        workspaceId={currentWorkspace.id}
        initialSettings={initialSettings}
        isAdmin={isAdmin}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/workspace-settings' as never)({
  component: WorkspaceSettingsPage,
});
