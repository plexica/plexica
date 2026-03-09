// apps/web/src/routes/settings.extensions.tsx
//
// T013-16: Workspace Extension Settings tab component.
// Renders when "Extensions" tab is active in settings.tsx.
//
// Pattern: accordion groups by host plugin → slot → ContributionRow rows with toggles.
// Optimistic UI on toggle with TanStack Query mutation; reverts on failure with Toast error.
// Empty state: "No extensions available."
//
// Gated by ENABLE_EXTENSION_POINTS feature flag (see settings.tsx for the tab trigger).
//
// FR-022, FR-025, FR-033, US-003

import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useFeatureFlag } from '@/lib/feature-flags';
import { apiClient } from '@/lib/api-client';
import { ContributionRow } from '@/components/extensions/ContributionRow';
import { toast } from '@/components/ToastProvider';
import type { ResolvedContribution } from '@plexica/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SlotGroup {
  slotId: string;
  slotLabel: string;
  contributions: ResolvedContribution[];
}

interface PluginGroup {
  hostPluginId: string;
  hostPluginName: string;
  slots: SlotGroup[];
}

interface ContributionsResponse {
  contributions: ResolvedContribution[];
}

interface VisibilityPatchResponse {
  success: boolean;
}

// ---------------------------------------------------------------------------
// Data grouping helper
// ---------------------------------------------------------------------------

function groupContributions(contributions: ResolvedContribution[]): PluginGroup[] {
  const pluginMap = new Map<string, PluginGroup>();

  for (const contribution of contributions) {
    const pluginId = contribution.targetPluginId;
    if (!pluginMap.has(pluginId)) {
      pluginMap.set(pluginId, {
        hostPluginId: pluginId,
        hostPluginName: pluginId, // server only returns contributingPluginName, not host plugin name
        slots: [],
      });
    }
    const group = pluginMap.get(pluginId)!;
    let slot = group.slots.find((s) => s.slotId === contribution.targetSlotId);
    if (!slot) {
      slot = {
        slotId: contribution.targetSlotId,
        slotLabel: contribution.targetSlotId,
        contributions: [],
      };
      group.slots.push(slot);
    }
    slot.contributions.push(contribution);
  }

  return Array.from(pluginMap.values());
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ExtensionSettingsPanel() {
  const extensionPointsEnabled = useFeatureFlag('ENABLE_EXTENSION_POINTS');
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id ?? '';
  const queryClient = useQueryClient();

  const queryKey = ['extension-settings-contributions', workspaceId];

  // Fetch all contributions for this workspace (no slotId filter — get all)
  const { data, isLoading, error } = useQuery<ResolvedContribution[]>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (workspaceId) params.set('workspaceId', workspaceId);
      const result = await (
        apiClient as unknown as { get: <T>(url: string) => Promise<T> }
      ).get<ContributionsResponse>(`/api/v1/extension-registry/contributions?${params.toString()}`);
      return result.contributions ?? [];
    },
    staleTime: 60_000,
    enabled: extensionPointsEnabled && !!workspaceId,
  });

  // Optimistic visibility toggle
  const toggleMutation = useMutation<
    VisibilityPatchResponse,
    Error,
    { contributionId: string; isVisible: boolean }
  >({
    mutationFn: async ({ contributionId, isVisible }) => {
      return (
        apiClient as unknown as {
          patch: <T>(url: string, body: unknown) => Promise<T>;
        }
      ).patch<VisibilityPatchResponse>(
        `/api/v1/workspaces/${workspaceId}/extension-visibility/${contributionId}`,
        { isVisible }
      );
    },
    onMutate: async ({ contributionId, isVisible }) => {
      // Cancel any in-flight refetch
      await queryClient.cancelQueries({ queryKey });

      // Snapshot the previous value
      const previous = queryClient.getQueryData<ResolvedContribution[]>(queryKey);

      // Optimistically update
      queryClient.setQueryData<ResolvedContribution[]>(
        queryKey,
        (old) => old?.map((c) => (c.id === contributionId ? { ...c, isVisible } : c)) ?? []
      );

      return { previous };
    },
    onError: (_err, _vars, context) => {
      // Revert on error
      if (context && (context as { previous?: ResolvedContribution[] }).previous) {
        queryClient.setQueryData(
          queryKey,
          (context as { previous: ResolvedContribution[] }).previous
        );
      }
      toast.error('Failed to update extension visibility. Please try again.');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const handleToggle = useCallback(
    (contributionId: string, isVisible: boolean) => {
      toggleMutation.mutate({ contributionId, isVisible });
    },
    [toggleMutation]
  );

  // Feature flag off
  if (!extensionPointsEnabled) return null;

  // Loading
  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 rounded-lg border border-border bg-muted/30 animate-pulse" />
        ))}
      </div>
    );
  }

  // Error
  if (error) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        Failed to load extension settings. Please try refreshing the page.
      </div>
    );
  }

  const contributions = data ?? [];
  const groups = groupContributions(contributions);

  // Empty state
  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <svg
          className="w-12 h-12 text-muted-foreground mb-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"
          />
        </svg>
        <p className="text-sm text-muted-foreground">No extensions available.</p>
        <p className="text-xs text-muted-foreground mt-1">
          Install plugins that contribute to workspace slots to see them here.
        </p>
      </div>
    );
  }

  const pendingId = toggleMutation.isPending
    ? (toggleMutation.variables as { contributionId: string } | undefined)?.contributionId
    : undefined;

  return (
    <div className="space-y-4" data-testid="extension-settings-panel">
      <p className="text-sm text-muted-foreground">
        Manage which plugin extensions are visible in this workspace.
      </p>

      {groups.map((group) => (
        <PluginAccordion
          key={group.hostPluginId}
          group={group}
          pendingId={pendingId}
          onToggle={handleToggle}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PluginAccordion — accordion per host plugin
// ---------------------------------------------------------------------------

interface PluginAccordionProps {
  group: PluginGroup;
  pendingId: string | undefined;
  onToggle: (contributionId: string, isVisible: boolean) => void;
}

function PluginAccordion({ group, pendingId, onToggle }: PluginAccordionProps) {
  const totalContributions = group.slots.reduce((acc, s) => acc + s.contributions.length, 0);

  return (
    <details className="group rounded-lg border border-border overflow-hidden" open>
      <summary
        className="flex items-center justify-between p-4 cursor-pointer bg-card hover:bg-muted/20 transition-colors list-none"
        aria-label={`${group.hostPluginName} extensions (${totalContributions})`}
      >
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-foreground">{group.hostPluginName}</span>
          <span className="text-xs text-muted-foreground">
            {totalContributions} contribution{totalContributions !== 1 ? 's' : ''}
          </span>
        </div>
        {/* chevron */}
        <svg
          className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </summary>

      <div className="px-4 pb-4 space-y-4 bg-card">
        {group.slots.map((slot) => (
          <div key={slot.slotId}>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 mt-4">
              {slot.slotLabel}
            </h4>
            <div className="space-y-2">
              {slot.contributions.map((contribution) => (
                <ContributionRow
                  key={contribution.id}
                  contribution={contribution}
                  isTenantDisabled={!contribution.isActive}
                  onToggle={onToggle}
                  isPending={pendingId === contribution.id}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}
