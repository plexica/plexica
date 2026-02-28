// apps/web/src/components/ErrorBoundary/PluginErrorBoundary.tsx
//
// React error boundary that catches all errors thrown inside plugin subtrees
// (render errors, lifecycle errors, and asynchronous errors caught via
// error events forwarded through getDerivedStateFromError).
//
// Usage:
//   <PluginErrorBoundary pluginId="crm" pluginName="CRM Plugin">
//     <Suspense fallback={<PluginLoadingSkeleton />}>
//       <PluginComponent />
//     </Suspense>
//   </PluginErrorBoundary>
//
// The boundary MUST wrap the Suspense boundary, not be wrapped by it.

import React from 'react';
import { PluginErrorFallback } from './PluginErrorFallback';
import { createContextLogger } from '../../lib/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PluginErrorBoundaryProps {
  /** Identifier of the plugin being rendered (used for logging + fallback). */
  pluginId: string;
  /** Display name of the plugin (shown in the fallback UI). */
  pluginName?: string;
  /** Child subtree to protect. */
  children: React.ReactNode;
  /**
   * Optional custom fallback component.
   * Receives the same props as PluginErrorFallback; defaults to PluginErrorFallback.
   */
  fallback?: React.ComponentType<{
    pluginName: string;
    error: Error | null;
    onRetry: () => void;
  }>;
  /**
   * Tenant slug — forwarded to the structured log entry for observability.
   * Can be omitted when the boundary is used outside an auth context (e.g., tests).
   */
  tenantSlug?: string;
  /**
   * User ID — forwarded to the structured log entry for observability.
   */
  userId?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export class PluginErrorBoundary extends React.Component<
  PluginErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: PluginErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
    this.resetError = this.resetError.bind(this);
  }

  // -------------------------------------------------------------------------
  // Static lifecycle — called synchronously before render on any error
  // -------------------------------------------------------------------------

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  // -------------------------------------------------------------------------
  // Instance lifecycle — called after render, used for side-effects (logging)
  // -------------------------------------------------------------------------

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    const { pluginId, pluginName, tenantSlug, userId } = this.props;

    // Persist the component stack for rendering in dev-mode tools
    this.setState({ errorInfo });

    // Structured log with full context so the entry is queryable in dashboards
    const log = createContextLogger({ pluginId, tenantSlug, userId });
    log.error(
      {
        err: {
          message: error.message,
          stack: error.stack,
          name: error.name,
        },
        componentStack: errorInfo.componentStack,
        pluginId,
        pluginName: pluginName ?? pluginId,
        tenantSlug,
        userId,
        timestamp: new Date().toISOString(),
      },
      `[PluginErrorBoundary] Plugin "${pluginName ?? pluginId}" threw an unhandled error`
    );
  }

  // -------------------------------------------------------------------------
  // Public method — allows parent components or "Retry" button to reset
  // -------------------------------------------------------------------------

  resetError(): void {
    this.setState({ hasError: false, error: null, errorInfo: null });
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  render(): React.ReactNode {
    const { hasError, error } = this.state;
    const { children, pluginId, pluginName, fallback: FallbackComponent } = this.props;

    if (hasError) {
      const Fallback = FallbackComponent ?? PluginErrorFallback;
      return (
        <Fallback pluginName={pluginName ?? pluginId} error={error} onRetry={this.resetError} />
      );
    }

    return children;
  }
}
