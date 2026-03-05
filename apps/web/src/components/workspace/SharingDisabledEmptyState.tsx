// apps/web/src/components/workspace/SharingDisabledEmptyState.tsx
//
// T8.3 / T3.5: Empty state shown when allowCrossWorkspaceSharing is false.
// Per design-spec.md §4.4 — shows lock icon, explanation text, CTA to Settings.

import { Lock } from 'lucide-react';
import { Button } from '@plexica/ui';

interface SharingDisabledEmptyStateProps {
  onGoToSettings: () => void;
}

export function SharingDisabledEmptyState({ onGoToSettings }: SharingDisabledEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
        <Lock className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
      </div>
      <h3 className="mb-2 text-base font-semibold text-foreground">
        Cross-Workspace Sharing is Disabled
      </h3>
      <p className="mb-6 max-w-sm text-sm text-muted-foreground">
        Resource sharing must be enabled in workspace settings before you can share plugins with
        other workspaces.
      </p>
      <Button onClick={onGoToSettings}>Go to Settings</Button>
    </div>
  );
}
