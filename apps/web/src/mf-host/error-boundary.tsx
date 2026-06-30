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
const CRASH_STORAGE_KEY = 'plexica:plugin-crash-count:';

function getPersistedCrashCount(slug: string): number {
  try {
    const raw = sessionStorage.getItem(`${CRASH_STORAGE_KEY}${slug}`);
    return raw ? parseInt(raw, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

function setPersistedCrashCount(slug: string, count: number): void {
  try {
    if (count > 0) {
      sessionStorage.setItem(`${CRASH_STORAGE_KEY}${slug}`, String(count));
    } else {
      sessionStorage.removeItem(`${CRASH_STORAGE_KEY}${slug}`);
    }
  } catch {
    // sessionStorage may be unavailable (private browsing, SSR)
  }
}

export class PluginSlotErrorBoundary extends Component<Props, State> {
  private retryButtonRef = createRef<HTMLButtonElement>();

  constructor(props: Props) {
    super(props);
    const persisted = getPersistedCrashCount(props.pluginSlug);
    this.state = { hasError: false, crashCount: persisted };
  }

  // Set error state on crash — React only passes error, NOT prevState
  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Track crash count in sessionStorage (survives navigation)
    const newCount = this.state.crashCount + 1;
    setPersistedCrashCount(this.props.pluginSlug, newCount);
    this.setState({ crashCount: newCount });
    if (import.meta.env.DEV) {
      console.warn(`[PluginSlot] "${this.props.pluginSlug}" crashed (${newCount}/${MAX_CRASHES}):`, error.message);
    } else {
      console.error('[PluginError]', { slug: this.props.pluginSlug, error: error?.message, crashCount: newCount });
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
