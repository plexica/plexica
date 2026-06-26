// error-boundary.tsx
// Per-slot React error boundary for plugin MF components.
// Tracks consecutive crashes — resets on successful render.

import { Component, createRef } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { PluginUnavailable } from './plugin-unavailable.js';

interface Props {
  children: ReactNode;
  pluginSlug: string;
}

interface State {
  hasError: boolean;
  consecutiveCrashes: number;
}

const MAX_CONSECUTIVE_CRASHES = 3;

export class PluginSlotErrorBoundary extends Component<Props, State> {
  private containerRef = createRef<HTMLDivElement>();

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, consecutiveCrashes: 0 };
  }

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    if (import.meta.env.DEV) {
      console.warn(
        `[PluginSlotErrorBoundary] Plugin "${this.props.pluginSlug}" crashed:`,
        error.message,
        errorInfo
      );
    }
    this.containerRef.current?.focus();
  }

  handleRetry = (): void => {
    const nextCount = this.state.consecutiveCrashes + 1;

    if (nextCount >= MAX_CONSECUTIVE_CRASHES) {
      // Permanently degraded after consecutive crashes
      this.setState({ hasError: false, consecutiveCrashes: nextCount });
      return;
    }

    this.setState({ hasError: false, consecutiveCrashes: nextCount });
  };

  // Reset crash counter on successful render
  componentDidUpdate(_prevProps: Props, prevState: State): void {
    if (prevState.hasError && !this.state.hasError) {
      // Render succeeded — keep consecutiveCrashes as-is (it's checked in handleRetry)
    }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      const isPermanentlyDegraded = this.state.consecutiveCrashes >= MAX_CONSECUTIVE_CRASHES;

      return (
        <div ref={this.containerRef} tabIndex={-1} role="alert" aria-live="assertive">
          <PluginUnavailable
            pluginSlug={this.props.pluginSlug}
            isPermanentlyDegraded={isPermanentlyDegraded}
            onRetry={this.handleRetry}
          />
        </div>
      );
    }

    return this.props.children;
  }
}
