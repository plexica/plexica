// apps/web/src/components/workspace/SharedResourceRow.tsx
//
// T8.3 / T3.5: Row component for the sharing tab.
// Used in both outbound (shared FROM this workspace) and
// inbound (shared WITH this workspace) sections.
// Per design-spec.md §4.2 — plugin name, shared-by workspace, date, revoke button.

import { Puzzle } from 'lucide-react';
import { Badge, Button } from '@plexica/ui';

export interface SharedResource {
  id: string;
  resourceType: 'PLUGIN';
  resourceId: string;
  resourceName: string;
  /** For outbound rows: the workspace this was shared TO. */
  sharedWithWorkspaceName?: string;
  /** For inbound rows: the workspace that shared this TO us. */
  sharedFromWorkspaceName?: string;
  sharedByEmail: string;
  sharedAt: string; // ISO date string
}

interface SharedResourceRowProps {
  resource: SharedResource;
  /** Whether this row is in the outbound context (shared FROM this workspace). */
  isOutbound: boolean;
  /** Whether the current user can revoke (ADMIN of owning workspace). */
  canRevoke: boolean;
  onRevoke: (resource: SharedResource) => void;
}

export function SharedResourceRow({
  resource,
  isOutbound,
  canRevoke,
  onRevoke,
}: SharedResourceRowProps) {
  const date = new Date(resource.sharedAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const contextWorkspace = isOutbound
    ? resource.sharedWithWorkspaceName
    : resource.sharedFromWorkspaceName;

  const contextLabel = isOutbound ? 'Shared with' : 'Shared from';

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-4">
      <div className="flex items-start gap-3 min-w-0">
        <div className="flex-shrink-0 mt-0.5 flex h-9 w-9 items-center justify-center rounded-md bg-muted">
          <Puzzle className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{resource.resourceName}</p>
          {contextWorkspace && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {contextLabel}: <span className="font-medium">{contextWorkspace}</span>
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-0.5">
            Shared by {resource.sharedByEmail} on {date}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-shrink-0">
        <Badge variant="secondary" className="text-xs uppercase">
          {resource.resourceType}
        </Badge>
        {canRevoke && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onRevoke(resource)}
            aria-label={`Revoke access to ${resource.resourceName}`}
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            Revoke
          </Button>
        )}
      </div>
    </div>
  );
}
