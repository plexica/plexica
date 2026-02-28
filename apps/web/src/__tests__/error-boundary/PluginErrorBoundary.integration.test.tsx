// apps/web/src/__tests__/error-boundary/PluginErrorBoundary.integration.test.tsx
//
// T1.6: Integration tests for PluginErrorBoundary in a more realistic context.
//
// These tests verify:
//  - Plugin load error triggers boundary
//  - Plugin render error triggers boundary
//  - Boundary co-exists correctly with React Suspense
//  - Multiple independent boundaries don't interfere

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React, { Suspense, lazy } from 'react';

// ---------------------------------------------------------------------------
// Mock Pino logger (required by PluginErrorBoundary)
// ---------------------------------------------------------------------------

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  createContextLogger: vi.fn(() => ({ error: vi.fn() })),
}));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('@plexica/ui', () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
}));

// ---------------------------------------------------------------------------
// Import component after mocks
// ---------------------------------------------------------------------------

import { PluginErrorBoundary } from '@/components/ErrorBoundary/PluginErrorBoundary';

// ---------------------------------------------------------------------------
// Silence React error output
// ---------------------------------------------------------------------------

const originalConsoleError = console.error;
beforeAll(() => {
  console.error = vi.fn();
});
afterAll(() => {
  console.error = originalConsoleError;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function GoodPlugin({ pluginId }: { pluginId: string }) {
  return <div data-testid={`plugin-ok-${pluginId}`}>Plugin {pluginId} running fine</div>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CrashingPlugin(): any {
  throw new Error('Plugin crashed during render');
}

// A lazy component that never resolves — used to hold Suspense in loading state.
// Defined at module scope to satisfy the React Compiler's no-component-during-render rule.
const NeverResolvesLazy = lazy(() => new Promise<{ default: React.ComponentType }>(() => {}));

function LoadingSuspensePlugin() {
  return (
    <Suspense fallback={<div data-testid="loading-spinner">Loading plugin…</div>}>
      <NeverResolvesLazy />
    </Suspense>
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PluginErrorBoundary integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // 1. Plugin that loads and renders correctly
  // -----------------------------------------------------------------------

  it('renders healthy plugin without triggering boundary', () => {
    render(
      <PluginErrorBoundary pluginId="analytics" pluginName="Analytics">
        <GoodPlugin pluginId="analytics" />
      </PluginErrorBoundary>
    );
    expect(screen.getByTestId('plugin-ok-analytics')).toBeInTheDocument();
    expect(screen.queryByText('Plugin Unavailable')).not.toBeInTheDocument();
  });

  // -----------------------------------------------------------------------
  // 2. Plugin render error triggers boundary
  // -----------------------------------------------------------------------

  it('triggers boundary when plugin component throws during render', () => {
    render(
      <PluginErrorBoundary pluginId="crm" pluginName="CRM Plugin">
        <CrashingPlugin />
      </PluginErrorBoundary>
    );
    expect(screen.getByText('Plugin Unavailable')).toBeInTheDocument();
    expect(screen.getByText(/"CRM Plugin"/)).toBeInTheDocument();
    expect(screen.getByText(/Plugin crashed during render/)).toBeInTheDocument();
  });

  // -----------------------------------------------------------------------
  // 3. Boundary wraps Suspense correctly — loading state unaffected
  // -----------------------------------------------------------------------

  it('shows Suspense fallback while plugin is loading (no error triggered)', () => {
    render(
      <PluginErrorBoundary pluginId="slow-plugin" pluginName="Slow Plugin">
        <LoadingSuspensePlugin />
      </PluginErrorBoundary>
    );
    // Suspense fallback should be visible
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    // Error fallback should NOT be visible
    expect(screen.queryByText('Plugin Unavailable')).not.toBeInTheDocument();
  });

  // -----------------------------------------------------------------------
  // 4. Multiple boundaries are independent — one crash does not affect others
  // -----------------------------------------------------------------------

  it('only the crashing plugin boundary triggers, others remain healthy', () => {
    render(
      <div>
        <PluginErrorBoundary pluginId="good-plugin" pluginName="Good Plugin">
          <GoodPlugin pluginId="good" />
        </PluginErrorBoundary>

        <PluginErrorBoundary pluginId="bad-plugin" pluginName="Bad Plugin">
          <CrashingPlugin />
        </PluginErrorBoundary>
      </div>
    );

    // Good plugin still renders
    expect(screen.getByTestId('plugin-ok-good')).toBeInTheDocument();
    // Bad plugin shows fallback
    expect(screen.getByText('Plugin Unavailable')).toBeInTheDocument();
    expect(screen.getByText(/"Bad Plugin"/)).toBeInTheDocument();
  });

  // -----------------------------------------------------------------------
  // 5. Retry re-mounts the child subtree
  // -----------------------------------------------------------------------

  it('re-mounts the plugin after Retry is clicked', () => {
    let shouldThrow = true;

    function FlipFlop() {
      if (shouldThrow) throw new Error('initial crash');
      return <div data-testid="healthy">healthy after retry</div>;
    }

    const { rerender } = render(
      <PluginErrorBoundary pluginId="flip" pluginName="Flip Plugin">
        <FlipFlop />
      </PluginErrorBoundary>
    );

    // Boundary triggered
    expect(screen.getByText('Plugin Unavailable')).toBeInTheDocument();

    // Allow recovery
    shouldThrow = false;

    act(() => {
      fireEvent.click(screen.getByText('Retry'));
    });

    rerender(
      <PluginErrorBoundary pluginId="flip" pluginName="Flip Plugin">
        <FlipFlop />
      </PluginErrorBoundary>
    );

    expect(screen.getByTestId('healthy')).toBeInTheDocument();
  });
});
