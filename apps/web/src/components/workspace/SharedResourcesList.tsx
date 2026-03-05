// apps/web/src/components/workspace/SharedResourcesList.tsx
//
// T3.5: Table/list of shared resources with filter and empty states.
// Shows loading skeleton during fetch, empty state when no resources.
// Uses TanStack Query hooks for data fetching.
// Constitution Art. 5.1 — Revoke only visible for workspace ADMIN.

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Share2 } from 'lucide-react';
import {
  Button,
  Badge,
  Skeleton,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@plexica/ui';
import { SharedResourceRow } from './SharedResourceRow';
import type { SharedResource } from './SharedResourceRow';
import { SharePluginDialog } from './SharePluginDialog';
import type { Plugin, TargetWorkspace } from './SharePluginDialog';
import { RevokeShareDialog } from './RevokeShareDialog';
import { SharingDisabledEmptyState } from './SharingDisabledEmptyState';
import { apiClient } from '@/lib/api-client';

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function fetchSharedResources(workspaceId: string): Promise<SharedResource[]> {
  const resources = await apiClient.getWorkspaceResources(workspaceId);
  // The API returns resourceType as string; cast to the known discriminated union type.
  return resources as SharedResource[];
}

async function shareResource(
  workspaceId: string,
  pluginIds: string[],
  targetWorkspaceIds: string[]
): Promise<void> {
  // Batch with concurrency limit of 5
  const pairs = pluginIds.flatMap((pluginId) =>
    targetWorkspaceIds.map((targetWorkspaceId) => ({ pluginId, targetWorkspaceId }))
  );
  for (let i = 0; i < pairs.length; i += 5) {
    await Promise.all(
      pairs.slice(i, i + 5).map(({ pluginId, targetWorkspaceId }) =>
        apiClient.shareWorkspaceResource(workspaceId, {
          resourceType: 'PLUGIN',
          resourceId: pluginId,
          targetWorkspaceId,
        })
      )
    );
  }
}

async function revokeResource(workspaceId: string, shareId: string): Promise<void> {
  return apiClient.revokeWorkspaceResource(workspaceId, shareId);
}

// ---------------------------------------------------------------------------
// SharedResourcesList
// ---------------------------------------------------------------------------

interface SharedResourcesListProps {
  workspaceId: string;
  isAdmin: boolean;
  /** When false, shows the SharingDisabledEmptyState */
  sharingEnabled: boolean;
  onGoToSettings: () => void;
  /** Available plugins to share (from installed plugins API) */
  availablePlugins?: Plugin[];
  /** All tenant workspaces (for target workspace selector) */
  tenantWorkspaces?: TargetWorkspace[];
}

export function SharedResourcesList({
  workspaceId,
  isAdmin,
  sharingEnabled,
  onGoToSettings,
  availablePlugins = [],
  tenantWorkspaces = [],
}: SharedResourcesListProps) {
  const queryClient = useQueryClient();
  const [filterType, setFilterType] = useState<'ALL' | 'PLUGIN'>('ALL');
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<SharedResource | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);

  const { data: resources = [], isLoading } = useQuery({
    queryKey: ['workspace', workspaceId, 'resources'],
    queryFn: () => fetchSharedResources(workspaceId),
    enabled: !!workspaceId && sharingEnabled,
  });

  const revokeMutation = useMutation({
    mutationFn: (resourceId: string) => revokeResource(workspaceId, resourceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId, 'resources'] });
      setRevokeTarget(null);
      setRevokeError(null);
    },
    onError: (err: unknown) => {
      const apiErr = err as { response?: { data?: { error?: { message?: string } } } };
      setRevokeError(apiErr?.response?.data?.error?.message ?? 'Failed to revoke access');
    },
  });

  // Sharing disabled state
  if (!sharingEnabled) {
    return <SharingDisabledEmptyState onGoToSettings={onGoToSettings} />;
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  const outbound = resources.filter(
    (r) =>
      r.sharedWithWorkspaceName !== undefined &&
      r.sharedWithWorkspaceName !== null &&
      r.sharedWithWorkspaceName !== ''
  );
  const inbound = resources.filter(
    (r) =>
      r.sharedFromWorkspaceName !== undefined &&
      r.sharedFromWorkspaceName !== null &&
      r.sharedFromWorkspaceName !== ''
  );

  const filteredOutbound =
    filterType === 'ALL' ? outbound : outbound.filter((r) => r.resourceType === filterType);
  const filteredInbound =
    filterType === 'ALL' ? inbound : inbound.filter((r) => r.resourceType === filterType);

  async function handleShare(pluginIds: string[], workspaceIds: string[]) {
    try {
      setShareError(null);
      await shareResource(workspaceId, pluginIds, workspaceIds);
      queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId, 'resources'] });
      setShareDialogOpen(false);
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: { error?: { message?: string } } } };
      setShareError(apiErr?.response?.data?.error?.message ?? 'Failed to share plugin');
      throw err; // Keeps dialog open
    }
  }

  return (
    <div className="space-y-6">
      {/* Header actions */}
      <div className="flex items-center justify-between gap-4">
        <Select value={filterType} onValueChange={(v) => setFilterType(v as 'ALL' | 'PLUGIN')}>
          <SelectTrigger className="w-32" aria-label="Filter by resource type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Types</SelectItem>
            <SelectItem value="PLUGIN">Plugins</SelectItem>
          </SelectContent>
        </Select>
        {isAdmin && <Button onClick={() => setShareDialogOpen(true)}>Share Plugin</Button>}
      </div>

      {/* Outbound section */}
      <section aria-labelledby="outbound-heading">
        <div className="flex items-center gap-2 mb-3">
          <h3 id="outbound-heading" className="text-sm font-semibold text-foreground">
            Shared Resources
          </h3>
          <Badge variant="secondary" className="text-xs">
            {filteredOutbound.length}
          </Badge>
        </div>

        {filteredOutbound.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center rounded-lg border border-dashed border-border">
            <Share2 className="h-8 w-8 text-muted-foreground mb-2" aria-hidden="true" />
            <p className="text-sm text-muted-foreground mb-3">No resources shared yet</p>
            <p className="text-xs text-muted-foreground mb-4">
              Share plugins with other workspaces to enable collaboration across teams.
            </p>
            {isAdmin && (
              <Button size="sm" onClick={() => setShareDialogOpen(true)}>
                Share Your First Plugin
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredOutbound.map((resource) => (
              <SharedResourceRow
                key={resource.id}
                resource={resource}
                isOutbound={true}
                canRevoke={isAdmin}
                onRevoke={(r) => {
                  setRevokeTarget(r);
                  setRevokeError(null);
                }}
              />
            ))}
          </div>
        )}
      </section>

      {/* Inbound section */}
      <section aria-labelledby="inbound-heading">
        <div className="flex items-center gap-2 mb-3">
          <h3 id="inbound-heading" className="text-sm font-semibold text-foreground">
            Resources Shared With This Workspace
          </h3>
          <Badge variant="secondary" className="text-xs">
            {filteredInbound.length}
          </Badge>
        </div>

        {filteredInbound.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No resources shared with this workspace
          </p>
        ) : (
          <div className="space-y-2">
            {filteredInbound.map((resource) => (
              <SharedResourceRow
                key={resource.id}
                resource={resource}
                isOutbound={false}
                canRevoke={false}
                onRevoke={() => {}}
              />
            ))}
          </div>
        )}
      </section>

      {/* Share Plugin Dialog */}
      <SharePluginDialog
        open={shareDialogOpen}
        plugins={availablePlugins}
        targetWorkspaces={tenantWorkspaces}
        error={shareError}
        onClose={() => {
          setShareDialogOpen(false);
          setShareError(null);
        }}
        onShare={handleShare}
      />

      {/* Revoke Confirmation Dialog */}
      <RevokeShareDialog
        open={revokeTarget !== null}
        resource={revokeTarget}
        targetWorkspaceName={revokeTarget?.sharedWithWorkspaceName ?? ''}
        isLoading={revokeMutation.isPending}
        error={revokeError}
        onClose={() => {
          setRevokeTarget(null);
          setRevokeError(null);
        }}
        onConfirm={() => {
          if (revokeTarget) revokeMutation.mutate(revokeTarget.id);
        }}
      />
    </div>
  );
}
