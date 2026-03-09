// apps/web/src/components/extensions/ContributionRow.tsx
//
// T013-16: Individual contribution row for the workspace extension settings page.
// Shows plugin contribution with a toggle to enable/disable visibility in this workspace.
//
// 4 variants:
//   enabled         — toggle on, fully interactive
//   disabled-tenant — grayed, toggle off + locked, tooltip "Disabled by tenant admin"
//   disabled-workspace — toggle off, can be re-enabled by workspace admin
//   warning         — AlertTriangle badge for type_mismatch / target_not_found status
//
// Shows previewUrl thumbnail (80×60px) when present (FR-033).
// Toggle: aria-label="Toggle {label} visibility"
// Disabled toggles: aria-disabled="true"
//
// FR-022, FR-025, FR-033, US-003

import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Switch } from '@plexica/ui';
import { Badge } from '@plexica/ui';
import type { ResolvedContribution } from '@plexica/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ContributionRowProps {
  contribution: ResolvedContribution;
  /** Whether the contributing plugin is disabled at the tenant level (not just this workspace). */
  isTenantDisabled?: boolean;
  /** Callback when workspace admin toggles visibility. */
  onToggle?: (contributionId: string, isVisible: boolean) => void;
  /** Whether the toggle mutation is in-flight (for optimistic UI). */
  isPending?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const ContributionRow: React.FC<ContributionRowProps> = ({
  contribution,
  isTenantDisabled = false,
  onToggle,
  isPending = false,
}) => {
  const {
    id,
    contributingPluginId,
    contributingPluginName,
    previewUrl,
    validationStatus,
    isVisible,
    isActive,
  } = contribution;

  const hasWarning =
    validationStatus === 'type_mismatch' || validationStatus === 'target_not_found';

  const isDisabledByTenant = isTenantDisabled || !isActive;

  const label = contributingPluginName || contributingPluginId;
  const toggleLabel = `Toggle ${label} visibility`;

  const handleToggle = (checked: boolean) => {
    if (!isDisabledByTenant && onToggle) {
      onToggle(id, checked);
    }
  };

  return (
    <div
      className={`flex items-center gap-4 p-3 rounded-lg border transition-colors ${
        isDisabledByTenant
          ? 'border-border/50 bg-muted/30 opacity-60'
          : 'border-border bg-card hover:bg-muted/20'
      }`}
      data-testid={`contribution-row-${id}`}
      data-contribution-id={id}
      data-plugin-id={contributingPluginId}
    >
      {/* Preview thumbnail */}
      {previewUrl && (
        <div className="shrink-0">
          <img
            src={previewUrl}
            alt={`${label} preview`}
            width={80}
            height={60}
            className="rounded object-cover border border-border"
            loading="lazy"
          />
        </div>
      )}

      {/* Plugin info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground truncate">{label}</span>

          {hasWarning && (
            <span
              className="inline-flex items-center gap-1 text-xs text-warning shrink-0"
              title={
                validationStatus === 'type_mismatch'
                  ? 'Type mismatch — this contribution may not render correctly'
                  : 'Target slot not found — the slot this contributes to is no longer active'
              }
            >
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="sr-only">Warning: {validationStatus}</span>
            </span>
          )}

          {isDisabledByTenant && (
            <Badge variant="outline" className="text-xs shrink-0">
              Tenant disabled
            </Badge>
          )}
        </div>

        <p className="text-xs text-muted-foreground mt-0.5">{contributingPluginId}</p>

        {isDisabledByTenant && (
          <p className="text-xs text-muted-foreground mt-1 italic">Disabled by tenant admin</p>
        )}
      </div>

      {/* Visibility toggle */}
      <div className="shrink-0">
        {isDisabledByTenant ? (
          <Switch checked={false} disabled aria-label={toggleLabel} aria-disabled="true" />
        ) : (
          <Switch
            checked={isVisible}
            onCheckedChange={handleToggle}
            disabled={isPending}
            aria-label={toggleLabel}
          />
        )}
      </div>
    </div>
  );
};
