// route-error-boundary.tsx
// React class component error boundary for route subtrees.
// AppShell (sidebar + header) remains intact; only the main content shows the fallback.

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
      return (
        <main id="main-content">
          {this.state.error !== undefined ? (
            <ErrorFallback error={this.state.error} />
          ) : (
            <ErrorFallback />
          )}
        </main>
      );
    }

    return this.props.children;
  }
}
