// apps/web/src/components/workspace/PluginToggleCard.tsx
//
// T011-24: PluginToggleCard — workspace-level plugin enable/disable card.
// Spec 011 Phase 4 (FR-023, FR-025).
// WCAG 2.1 AA: aria-label on toggle, aria-describedby for disabled tooltip.
//
// Fixes applied:
//   F-002: Double-toggle guard — bail early if mutation is already in-flight
//   F-007: JSON schema validation — config must be a non-null, non-array plain object
//   F-033: Pino structured logging on all mutation errors

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Puzzle, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
import { logger } from '@/lib/logger';
import {
  Switch,
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  Badge,
} from '@plexica/ui';
import { cn } from '@/lib/utils';
import { apiClient } from '@/lib/api-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkspacePlugin {
  pluginId: string;
  name: string;
  version: string;
  description: string | null;
  /** Whether the plugin is enabled at the tenant level (gate) */
  tenantEnabled: boolean;
  /** Whether this workspace has the plugin enabled */
  enabled: boolean;
  configuration: Record<string, unknown>;
}

export interface PluginToggleCardProps {
  workspaceId: string;
  plugin: WorkspacePlugin;
  /** Role of the current user — only ADMIN sees the config editor */
  userRole?: 'ADMIN' | 'MEMBER' | 'VIEWER' | 'HIERARCHICAL_READER';
}

// ---------------------------------------------------------------------------
// API helper
// ---------------------------------------------------------------------------

async function patchWorkspacePlugin(
  workspaceId: string,
  pluginId: string,
  body: { enabled: boolean } | { configuration: Record<string, unknown> }
): Promise<void> {
  await apiClient.patch(`/api/workspaces/${workspaceId}/plugins/${pluginId}`, body);
}

// ---------------------------------------------------------------------------
// PluginToggleCard
// ---------------------------------------------------------------------------

export function PluginToggleCard({
  workspaceId,
  plugin,
  userRole = 'MEMBER',
}: PluginToggleCardProps) {
  const queryClient = useQueryClient();
  const [optimisticEnabled, setOptimisticEnabled] = useState(plugin.enabled);
  const [showConfig, setShowConfig] = useState(false);
  // H-004: Track the serialised config from the server (updated on successful save)
  const savedConfig = JSON.stringify(plugin.configuration, null, 2);
  const [configText, setConfigText] = useState(savedConfig);
  const [configError, setConfigError] = useState<string | null>(null);
  // Dirty flag: true when the user has typed something not yet saved
  const [isConfigDirty, setIsConfigDirty] = useState(false);

  // H-004: When the plugin prop changes (parent re-renders after cache invalidation)
  // and the user hasn't made unsaved edits, sync the textarea to the new value.
  // Uses derived state in render (React "adjusting state on prop change" pattern)
  // to avoid setState-in-effect cascading renders.
  const [prevSavedConfig, setPrevSavedConfig] = useState(savedConfig);
  if (savedConfig !== prevSavedConfig && !isConfigDirty) {
    setPrevSavedConfig(savedConfig);
    setConfigText(savedConfig);
  }

  const disabledDescId = `plugin-disabled-desc-${plugin.pluginId}`;
  const isAdmin = userRole === 'ADMIN';

  // Toggle enable/disable with optimistic update
  const toggleMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      patchWorkspacePlugin(workspaceId, plugin.pluginId, { enabled }),
    onMutate: (enabled) => {
      const previousEnabled = optimisticEnabled;
      setOptimisticEnabled(enabled);
      // Return previous value as rollback context
      return { previousEnabled };
    },
    onError: (_err, _enabled, context) => {
      // Rollback to the value captured at mutation time, not the stale prop
      if (context !== undefined) {
        setOptimisticEnabled(context.previousEnabled);
      }
      // F-033: structured error log
      logger.error(
        { component: 'PluginToggleCard', workspaceId, pluginId: plugin.pluginId },
        'Failed to toggle plugin'
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workspace-plugins', workspaceId] });
    },
  });

  // Save config mutation
  const configMutation = useMutation({
    mutationFn: (configuration: Record<string, unknown>) =>
      patchWorkspacePlugin(workspaceId, plugin.pluginId, { configuration }),
    onSuccess: () => {
      setConfigError(null);
      // H-004: Reset dirty flag so the textarea syncs with the next prop update
      setIsConfigDirty(false);
      void queryClient.invalidateQueries({ queryKey: ['workspace-plugins', workspaceId] });
    },
    onError: () => {
      // F-033: structured error log
      logger.error(
        { component: 'PluginToggleCard', workspaceId, pluginId: plugin.pluginId },
        'Failed to save plugin config'
      );
    },
  });

  function handleToggle(checked: boolean) {
    if (!plugin.tenantEnabled) return;
    // F-002: Guard against double-toggle while mutation is in-flight
    if (toggleMutation.isPending) return;
    toggleMutation.mutate(checked);
  }

  function handleSaveConfig() {
    try {
      const parsed = JSON.parse(configText) as unknown;
      // F-007: Ensure the parsed value is a plain non-null, non-array object
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        setConfigError('Configuration must be a JSON object (not an array or primitive).');
        return;
      }
      setConfigError(null);
      configMutation.mutate(parsed as Record<string, unknown>);
    } catch {
      setConfigError('Invalid JSON');
    }
  }

  return (
    <div
      className={cn(
        'rounded-md border border-border bg-card p-4 flex flex-col gap-3',
        !plugin.tenantEnabled && 'opacity-60'
      )}
      data-testid={`plugin-toggle-card-${plugin.pluginId}`}
    >
      {/* Header row */}
      <div className="flex items-start gap-3">
        {/* Plugin icon placeholder */}
        <div className="flex-none mt-0.5 text-muted-foreground" aria-hidden="true">
          <Puzzle className="w-5 h-5" />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm truncate">{plugin.name}</span>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
              v{plugin.version}
            </Badge>
            {!plugin.tenantEnabled && (
              <Badge
                variant="danger"
                className="text-[10px] px-1.5 py-0 shrink-0"
                id={disabledDescId}
              >
                Not tenant-enabled
              </Badge>
            )}
          </div>
          {plugin.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
              {plugin.description}
            </p>
          )}
        </div>

        {/* Toggle */}
        {plugin.tenantEnabled ? (
          <Switch
            checked={optimisticEnabled}
            onCheckedChange={handleToggle}
            disabled={toggleMutation.isPending}
            aria-label={`${optimisticEnabled ? 'Disable' : 'Enable'} ${plugin.name}`}
          />
        ) : (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-not-allowed" aria-describedby={disabledDescId}>
                  <Switch
                    checked={false}
                    disabled
                    aria-label={`${plugin.name} — not available (not tenant-enabled)`}
                  />
                </span>
              </TooltipTrigger>
              <TooltipContent>
                This plugin must be enabled at the tenant level before it can be used in workspaces.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      {/* Config editor (ADMIN only) */}
      {isAdmin && plugin.tenantEnabled && (
        <div className="border-t border-border pt-3">
          <button
            type="button"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setShowConfig((v) => !v)}
            aria-expanded={showConfig}
            aria-controls={`plugin-config-${plugin.pluginId}`}
          >
            {showConfig ? (
              <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            Plugin configuration
          </button>

          {showConfig && (
            <div id={`plugin-config-${plugin.pluginId}`} className="mt-2 flex flex-col gap-2">
              <textarea
                className={cn(
                  'w-full rounded-sm border bg-muted px-2 py-1.5 font-mono text-xs resize-y min-h-[80px]',
                  'focus:outline-none focus:ring-2 focus:ring-[var(--ring)]',
                  configError && 'border-destructive'
                )}
                value={configText}
                onChange={(e) => {
                  setConfigText(e.target.value);
                  setConfigError(null);
                  // H-004: Mark as dirty so we don't overwrite the user's edits
                  setIsConfigDirty(true);
                }}
                aria-label={`Configuration JSON for ${plugin.name}`}
                spellCheck={false}
              />
              {configError && (
                <p className="flex items-center gap-1 text-xs text-destructive" role="alert">
                  <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />
                  {configError}
                </p>
              )}
              <div className="flex justify-end">
                <button
                  type="button"
                  className={cn(
                    'rounded-sm px-3 py-1 text-xs font-medium bg-primary text-primary-foreground',
                    'hover:opacity-90 transition-opacity',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]',
                    configMutation.isPending && 'opacity-60 cursor-wait'
                  )}
                  onClick={handleSaveConfig}
                  disabled={configMutation.isPending}
                  aria-label={`Save configuration for ${plugin.name}`}
                >
                  {configMutation.isPending ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
