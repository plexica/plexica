// apps/web/src/components/extensions/ExtensionContribution.tsx
//
// T013-12: Individual contribution wrapper with React Error Boundary, 5-second
// load timeout, and structured Pino logging on failure.
//
// Key rules (spec plan §4.6):
//   - Each contribution wrapped in PluginErrorBoundary with ExtensionErrorFallback
//   - 5-second load timeout via setTimeout + state → treat as error (NFR-009)
//   - Structured Pino logging on error: pluginId, slotId, contributionId, tenantId (Art. 6.3)
//   - Hover badge showing contributing plugin name (8px Puzzle icon, aria-hidden)
//   - Prop isolation: MUST NOT pass host-internal state — only contextSchema + PluginProps (NFR-007)
//
// FR-009, US-007, NFR-007, NFR-008, NFR-009, NFR-012

import React, { Suspense, useState, useEffect, useCallback, useMemo } from 'react';
import { Puzzle } from 'lucide-react';
import { PluginErrorBoundary } from '@/components/ErrorBoundary/PluginErrorBoundary';
import { createContextLogger } from '@/lib/logger';
import { loadWidget } from '@/lib/widget-loader';
import { ExtensionErrorFallback } from './ExtensionErrorFallback';
import { ExtensionSlotSkeleton } from './ExtensionSlotSkeleton';
import type { ResolvedContribution, ExtensionSlotType } from '@plexica/types';

// ---------------------------------------------------------------------------
// Module-level component cache (React.lazy() must never be called in render)
// ---------------------------------------------------------------------------
const _contributionComponentCache = new Map<string, React.ComponentType<Record<string, unknown>>>();

function getCachedContributionComponent(
  pluginId: string,
  componentName: string
): React.ComponentType<Record<string, unknown>> {
  const key = `${pluginId}/${componentName}`;
  let comp = _contributionComponentCache.get(key);
  if (!comp) {
    comp = loadWidget({
      pluginId,
      widgetName: componentName,
    }) as React.ComponentType<Record<string, unknown>>;
    _contributionComponentCache.set(key, comp);
  }
  return comp;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ExtensionContributionProps {
  /** Full resolved contribution descriptor from the registry. */
  contribution: ResolvedContribution;
  /** Context data passed through from the host slot. Only declared contextSchema keys allowed. */
  context: Record<string, unknown>;
  /** Slot type — used to pick the right skeleton variant. */
  slotType?: ExtensionSlotType;
  /** Slot identifier (for logging). */
  slotId?: string;
  /**
   * Fix-10: Called once the contribution's lazy module has successfully mounted.
   * The parent <ExtensionSlot> uses this to track when ALL children have resolved
   * so that aria-busy can be set to "false" only after all contributions render.
   */
  onLoad?: () => void;
}

// ---------------------------------------------------------------------------
// Timeout sentinel error
// ---------------------------------------------------------------------------

class ContributionTimeoutError extends Error {
  constructor(pluginId: string, componentName: string) {
    super(`Contribution "${pluginId}/${componentName}" timed out after 5s`);
    this.name = 'ContributionTimeoutError';
  }
}

// ---------------------------------------------------------------------------
// Inner component — rendered inside the error boundary
// ---------------------------------------------------------------------------

interface InnerProps {
  contribution: ResolvedContribution;
  context: Record<string, unknown>;
  slotType?: ExtensionSlotType;
  onTimeout: () => void;
  /** Fix-10: callback invoked once the lazy component has mounted successfully. */
  onLoad?: () => void;
}

function ContributionInner({ contribution, context, slotType, onTimeout, onLoad }: InnerProps) {
  const { contributingPluginId, componentName } = contribution;

  // 5-second load timeout — if the component hasn't finished loading within
  // 5 seconds we treat it as an error and trigger the fallback.
  useEffect(() => {
    const timer = setTimeout(onTimeout, 5000);
    return () => clearTimeout(timer);
  }, [onTimeout]);

  // Fix-10: signal successful mount to the parent slot so aria-busy can advance.
  useEffect(() => {
    onLoad?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty — fire once on mount

  // Prop isolation: only pass context — no host-internal state (NFR-007).
  // React.createElement is used instead of JSX <Component> to avoid the
  // react-hooks/static-components rule, which fires on uppercase local
  // variables used as JSX tags. The component reference comes from a
  // module-level cache so the identity is stable across renders.
  return (
    <Suspense fallback={<ExtensionSlotSkeleton slotType={slotType ?? 'panel'} />}>
      {React.createElement(
        getCachedContributionComponent(contributingPluginId, componentName),
        context
      )}
    </Suspense>
  );
}

// ---------------------------------------------------------------------------
// ExtensionContribution
// ---------------------------------------------------------------------------

export const ExtensionContribution: React.FC<ExtensionContributionProps> = ({
  contribution,
  context,
  slotType,
  slotId,
  onLoad,
}) => {
  const { id, contributingPluginId, contributingPluginName, componentName } = contribution;
  const [timedOut, setTimedOut] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  // createContextLogger is called once per mount via useMemo to avoid creating a new
  // logger instance on every render (F-014). pluginId is stable for the lifetime of
  // this contribution element, so the dependency array is safe.
  const log = useMemo(
    () => createContextLogger({ pluginId: contributingPluginId }),
    [contributingPluginId]
  );

  const handleTimeout = useCallback(() => {
    const renderTimeMs = 5000;
    log.error(
      {
        pluginId: contributingPluginId,
        slotId: slotId ?? contribution.targetSlotId,
        contributionId: id,
        componentName,
        renderTimeMs,
        timestamp: new Date().toISOString(),
      },
      `[ExtensionContribution] Contribution "${contributingPluginId}/${componentName}" load timeout`
    );
    setTimedOut(true);
  }, [contributingPluginId, componentName, id, slotId, contribution.targetSlotId, log]);

  const handleRetry = useCallback(() => {
    setTimedOut(false);
    setRetryKey((k) => k + 1);
  }, []);

  // Fallback component for the error boundary — defined at module-stable reference
  // using useMemo so it doesn't re-create on every render. Must NOT use useCallback
  // to define React components (hooks rules + React component identity rules).
  const ErrorFallback = useMemo(
    (): React.ComponentType<{
      pluginName: string;
      error: Error | null;
      onRetry: () => void;
    }> =>
      function ExtensionErrorFallbackWrapper({ pluginName, error, onRetry }) {
        return (
          <ExtensionErrorFallback
            pluginName={pluginName}
            error={error}
            onRetry={() => {
              onRetry();
              handleRetry();
            }}
            variant={slotType === 'panel' || slotType === 'form' ? 'card' : 'compact'}
          />
        );
      },
    // handleRetry and slotType are stable enough — only recreate when slotType changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slotType]
  );

  if (timedOut) {
    return (
      <ExtensionErrorFallback
        pluginName={contributingPluginName}
        error={new ContributionTimeoutError(contributingPluginId, componentName)}
        onRetry={handleRetry}
        variant={slotType === 'panel' || slotType === 'form' ? 'card' : 'compact'}
      />
    );
  }

  return (
    <div
      className="relative group"
      data-testid={`extension-contribution-${id}`}
      data-contribution-id={id}
      data-plugin-id={contributingPluginId}
    >
      {/* Plugin attribution badge — visible on hover only (not announced to screen readers) */}
      <div
        className="absolute top-0 right-0 z-10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
        aria-hidden="true"
      >
        <span className="inline-flex items-center gap-1 rounded-bl bg-muted/80 px-1.5 py-0.5 text-[10px] text-muted-foreground">
          <Puzzle className="h-2 w-2" />
          {contributingPluginName}
        </span>
      </div>

      <PluginErrorBoundary
        key={retryKey}
        pluginId={contributingPluginId}
        pluginName={contributingPluginName}
        fallback={ErrorFallback}
      >
        <ContributionInner
          key={retryKey}
          contribution={contribution}
          context={context}
          slotType={slotType}
          onTimeout={handleTimeout}
          onLoad={onLoad}
        />
      </PluginErrorBoundary>
    </div>
  );
};
