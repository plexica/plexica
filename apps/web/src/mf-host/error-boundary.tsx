// error-boundary.tsx
// Per-slot React error boundary for plugin MF components.

import { Component, createRef } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { PluginUnavailable } from './plugin-unavailable.js';

interface Props {
  children: ReactNode;
  pluginSlug: string;
}

interface State {
  hasError: boolean;
  crashCount: number;
}

const MAX_CRASHES = 3;

export class PluginSlotErrorBoundary extends Component<Props, State> {
  private retryButtonRef = createRef<HTMLButtonElement>();

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, crashCount: 0 };
  }

  // Increment crash counter on each error
  static getDerivedStateFromError(_error: Error, prevState: State): Partial<State> {
    return { hasError: true, crashCount: (prevState.crashCount ?? 0) + 1 };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    if (import.meta.env.DEV) {
      console.warn(`[PluginSlot] "${this.props.pluginSlug}" crashed (${this.state.crashCount}/${MAX_CRASHES}):`, error.message);
    }
  }

  componentDidUpdate(_prevProps: Props, prevState: State): void {
    // Focus retry button on re-entry to error state (after retry failed)
    if (!prevState.hasError && this.state.hasError) {
      setTimeout(() => this.retryButtonRef.current?.focus(), 0);
    }
  }

  handleRetry = (): void => {
    // If max crashes reached, stay in error state (permanently degraded)
    if (this.state.crashCount >= MAX_CRASHES) return;
    this.setState({ hasError: false });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      const isPermanentlyDegraded = this.state.crashCount >= MAX_CRASHES;

      return (
        <div role="alert" aria-live="assertive">
          <PluginUnavailable
            pluginSlug={this.props.pluginSlug}
            isPermanentlyDegraded={isPermanentlyDegraded}
            onRetry={this.handleRetry}
            retryButtonRef={this.retryButtonRef}
          />
        </div>
      );
    }
    return this.props.children;
  }
}
