// route-error-boundary.tsx
// React class component error boundary for route subtrees.
// Rendered inside AppShell's <main> so the header and sidebar remain intact.
//
// Extracted from apps/web to @plexica/ui (Decision 7, 2026-08-18).
//
// The boundary should be keyed by pathname in each app's AppShell so it
// resets automatically on route change. The keying wrapper (KeyedErrorBoundary)
// is app-specific because it uses @tanstack/react-router's useLocation —
// keep it in each app, not here.

import { Component } from 'react';

import { ErrorFallback } from './error-fallback.js';

import type { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class RouteErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // L-7: only log to console in development. In production, integrate with
    // an error tracking service (e.g. Sentry) here instead (TD-001).
    if (typeof import.meta !== 'undefined' && (import.meta as { env?: { DEV?: boolean } }).env?.DEV) {
      // eslint-disable-next-line no-console
      console.error('RouteErrorBoundary caught:', error, info.componentStack);
    }
  }

  reset(): void {
    this.setState({ hasError: false });
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      return this.state.error !== undefined ? (
        <ErrorFallback error={this.state.error} />
      ) : (
        <ErrorFallback />
      );
    }

    return this.props.children;
  }
}
