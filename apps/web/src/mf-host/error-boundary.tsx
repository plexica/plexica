// error-boundary.tsx
// Per-slot React error boundary for plugin MF components.
// On error: focuses the retry button (not the container div). Fixes WCAG 2.4.3.

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
  private retryButtonRef = createRef<HTMLButtonElement>();

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, consecutiveCrashes: 0 };
  }

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    if (import.meta.env.DEV) {
      console.warn(`[PluginSlot] "${this.props.pluginSlug}" crashed:`, error.message, errorInfo);
    }
    // Focus the retry button (not the container div) — WCAG 2.4.3
    setTimeout(() => this.retryButtonRef.current?.focus(), 0);
  }

  handleRetry = (): void => {
    const nextCount = this.state.consecutiveCrashes + 1;
    if (nextCount >= MAX_CONSECUTIVE_CRASHES) {
      this.setState({ consecutiveCrashes: nextCount }); // Stay in error state
      return;
    }
    this.setState({ hasError: false, consecutiveCrashes: nextCount });
  };

  // Reset crash counter on successful recovery
  componentDidUpdate(_prevProps: Props, prevState: State): void {
    if (prevState.hasError && !this.state.hasError) {
      this.setState({ consecutiveCrashes: 0 });
    }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div role="alert" aria-live="assertive">
          <PluginUnavailable
            pluginSlug={this.props.pluginSlug}
            isPermanentlyDegraded={this.state.consecutiveCrashes >= MAX_CONSECUTIVE_CRASHES}
            onRetry={this.handleRetry}
            retryButtonRef={this.retryButtonRef}
          />
        </div>
      );
    }
    return this.props.children;
  }
}
