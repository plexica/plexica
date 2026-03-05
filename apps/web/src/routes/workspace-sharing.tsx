// apps/web/src/routes/workspace-sharing.tsx
//
// T8.5: Workspace sharing tab — shows both outbound (shared FROM this workspace)
// and inbound (shared WITH this workspace) resources on one page.
// Constitution Art. 5.1 — Share Plugin button ADMIN only.
// Constitution Art. 1.3 — WCAG 2.1 AA (aria-live regions for empty states).

import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { SharedResourcesList } from '@/components/workspace/SharedResourcesList';
import { Skeleton } from '@plexica/ui';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function WorkspaceSharingPage() {
  const { currentWorkspace, isAdmin, isLoading } = useWorkspace();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-lg" />
      </div>
    );
  }

  if (!currentWorkspace) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-sm text-muted-foreground">No workspace selected</p>
      </div>
    );
  }

  const sharingEnabled = Boolean(currentWorkspace.settings?.allowCrossWorkspaceSharing);

  return (
    <div className="p-6 space-y-4 max-w-4xl">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Shared Resources</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Manage plugins shared between workspaces in your organisation.
        </p>
      </div>

      <SharedResourcesList
        workspaceId={currentWorkspace.id}
        isAdmin={isAdmin}
        sharingEnabled={sharingEnabled}
        onGoToSettings={() => navigate({ to: '/workspace-settings' as never })}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/workspace-sharing' as never)({
  component: WorkspaceSharingPage,
});
