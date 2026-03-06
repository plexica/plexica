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
  // Async error bridge — capture unhandled promise rejections that originate
  // inside plugin subtrees but escape React's synchronous error propagation
  // (e.g. promises fired in useEffect without a catch handler).
  //
  // Note: attribution is best-effort. We catch ALL unhandledrejection events
  // while this boundary is mounted and route them through getDerivedStateFromError.
  // This is safe because PluginErrorBoundary is only mounted inside the plugin
  // route; the RootErrorBoundary above it handles shell-level rejections.
  // -------------------------------------------------------------------------

  private handleUnhandledRejection = (event: PromiseRejectionEvent): void => {
    const error =
      event.reason instanceof Error
        ? event.reason
        : new Error(String(event.reason ?? 'Unknown async error'));

    const { pluginId, pluginName, tenantSlug, userId } = this.props;
    const log = createContextLogger({ pluginId, tenantSlug, userId });

    // MED-3: In production, truncate error.message to avoid potential PII in logs,
    // and omit error.stack entirely (stack traces may contain file paths / data).
    // In development, log the full message and stack for easier debugging.
    const safeMessage = import.meta.env.DEV ? error.message : error.message.slice(0, 200);
    const safeStack = import.meta.env.DEV ? error.stack : undefined;

    log.error(
      {
        err: { message: safeMessage, stack: safeStack, name: error.name },
        pluginId,
        pluginName: pluginName ?? pluginId,
        tenantSlug,
        userId,
        timestamp: new Date().toISOString(),
      },
      `[PluginErrorBoundary] Plugin "${pluginName ?? pluginId}" unhandledrejection`
    );

    // Note: We intentionally do NOT call event.preventDefault() here.
    // Suppressing all unhandledrejection events would swallow auth failures,
    // API errors, and other app-level rejections that must remain visible.

    // Note: multi-boundary behaviour — when multiple PluginErrorBoundary
    // instances are mounted simultaneously, ALL of them receive the same
    // unhandledrejection event (global window listener). Each boundary will
    // independently set its own hasError state and show its fallback UI.
    // This is a known, accepted limitation: attribution is best-effort because
    // the browser does not identify which React subtree the rejection originated
    // from. In practice, only one boundary is mounted per plugin route, so
    // false positives are rare. See MED-1 in decision-log.md.

    this.setState({ hasError: true, error, errorInfo: null });
  };

  componentDidMount(): void {
    window.addEventListener('unhandledrejection', this.handleUnhandledRejection);
  }

  componentWillUnmount(): void {
    window.removeEventListener('unhandledrejection', this.handleUnhandledRejection);
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    const { pluginId, pluginName, tenantSlug, userId } = this.props;

    // Persist the component stack for rendering in dev-mode tools
    this.setState({ errorInfo });

    // Structured log with full context so the entry is queryable in dashboards.
    // MED-3: In production, truncate error.message and omit error.stack /
    // componentStack to prevent accidental PII leakage into log aggregators.
    const safeMessage = import.meta.env.DEV ? error.message : error.message.slice(0, 200);
    const safeStack = import.meta.env.DEV ? error.stack : undefined;
    const safeComponentStack = import.meta.env.DEV ? errorInfo.componentStack : undefined;

    const log = createContextLogger({ pluginId, tenantSlug, userId });
    log.error(
      {
        err: {
          message: safeMessage,
          stack: safeStack,
          name: error.name,
        },
        componentStack: safeComponentStack,
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
