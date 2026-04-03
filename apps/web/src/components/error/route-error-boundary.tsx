// route-error-boundary.tsx
// React class component error boundary for route subtrees.
// Rendered inside AppShell's <main> so the header and sidebar remain intact.
// The boundary is keyed by pathname via KeyedErrorBoundary in app-shell.tsx —
// it resets automatically when the user navigates to a different route.

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
    // an error tracking service (e.g. Sentry) here instead.
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error('RouteErrorBoundary caught:', error, info.componentStack);
    }
  }

  reset(): void {
    this.setState({ hasError: false });
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      // No <main> wrapper here — this component is already rendered inside
      // AppShell's <main id="main-content">.
      return this.state.error !== undefined ? (
        <ErrorFallback error={this.state.error} />
      ) : (
        <ErrorFallback />
      );
    }

    return this.props.children;
  }
}
