// apps/web/src/components/ErrorBoundary/RootErrorBoundary.tsx
//
// Top-level React error boundary that catches unhandled errors thrown anywhere
// in the application tree — including inside ThemeProvider, IntlProvider,
// QueryClientProvider, or RouterProvider.
//
// Must be placed as close to the React root as possible (inside StrictMode,
// wrapping all context providers). See main.tsx.
//
// Spec 010 FR-016: Shell-level error boundary
// Spec 010 FR-017: Structured Pino error logging (ADR-021)
// Spec 010 FR-018: Component stack capture for observability
//
// Constitution Art. 6.3: Pino JSON logging with standard fields
// Constitution Art. 1.3: Actionable error messages for users

import React from 'react';
import { RootErrorFallback } from './RootErrorFallback';
import { logger } from '../../lib/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RootErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export interface RootErrorBoundaryProps {
  children: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export class RootErrorBoundary extends React.Component<
  RootErrorBoundaryProps,
  RootErrorBoundaryState
> {
  constructor(props: RootErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  // -------------------------------------------------------------------------
  // Static lifecycle — called synchronously before render on any error
  // -------------------------------------------------------------------------

  static getDerivedStateFromError(error: Error): RootErrorBoundaryState {
    return { hasError: true, error };
  }

  // -------------------------------------------------------------------------
  // Instance lifecycle — called after render for side-effects (logging)
  // -------------------------------------------------------------------------

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Wrap in try/catch: logging must never throw and re-trigger the boundary
    try {
      logger.error(
        {
          err: {
            message: error.message,
            name: error.name,
            stack: error.stack,
          },
          componentStack: errorInfo.componentStack,
          timestamp: new Date().toISOString(),
        },
        '[RootErrorBoundary] Unhandled application error'
      );
    } catch {
      // Silently swallow logging errors — the fallback UI is already showing
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  render(): React.ReactNode {
    const { hasError, error } = this.state;
    const { children } = this.props;

    if (hasError) {
      return <RootErrorFallback error={error} />;
    }

    return children;
  }
}
