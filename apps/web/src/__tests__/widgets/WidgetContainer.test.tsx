// apps/web/src/__tests__/widgets/WidgetContainer.test.tsx
//
// T005-05: Unit tests for WidgetContainer component.
//
// Architecture note (updated 2026-03-01):
// WidgetContainer was refactored from a useEffect-based state machine to
// React.lazy() + Suspense + PluginErrorBoundary (HIGH-002 fix).
//
// Error-path behaviour:
//   - Import failure (no MF runtime in jsdom): caught INSIDE loadWidget's
//     React.lazy callback → returns BuiltInFallback → renders widget-unavailable.
//   - Render-time error (widget component throws during render): caught by
//     PluginErrorBoundary → renders BuiltInErrorFallback (widget-error-fallback)
//     or the custom errorFallback ReactNode.
//
// These tests cover import-failure paths (the common jsdom path) and
// the feature-flag, section structure, and loading skeleton paths.

import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Enable the ENABLE_PLUGIN_WIDGETS feature flag for all tests in this suite.
// WidgetContainer renders null when the flag is off.
// ---------------------------------------------------------------------------

const { mockUseFeatureFlag } = vi.hoisted(() => ({
  mockUseFeatureFlag: vi.fn(() => true),
}));

vi.mock('@/lib/feature-flags', () => ({
  useFeatureFlag: mockUseFeatureFlag,
}));

// Suppress logger noise from loadWidget's error logging
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  createContextLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }),
}));

import { WidgetContainer } from '../../components/WidgetContainer';

beforeEach(() => {
  vi.clearAllMocks();
  // Flag must be ON — WidgetContainer renders null when ENABLE_PLUGIN_WIDGETS is false
  mockUseFeatureFlag.mockReturnValue(true);
});

describe('WidgetContainer', () => {
  // ---- Test 0 ---------------------------------------------------------------
  it('renders nothing when ENABLE_PLUGIN_WIDGETS flag is off', () => {
    mockUseFeatureFlag.mockReturnValue(false);
    const { container } = render(
      <WidgetContainer pluginId="crm" widgetName="SalesChart" title="Monthly Sales" />
    );
    expect(container).toBeEmptyDOMElement();
  });

  // ---- Test 1 ---------------------------------------------------------------
  it('renders section with role="region" and aria-label matching title prop', async () => {
    await act(async () => {
      render(<WidgetContainer pluginId="crm" widgetName="SalesChart" title="Monthly Sales" />);
    });

    const section = screen.getByRole('region', { name: 'Monthly Sales' });
    expect(section).toBeInTheDocument();
  });

  // ---- Test 2 ---------------------------------------------------------------
  it('shows loading skeleton (Suspense fallback) while the widget module is resolving', () => {
    // The loading skeleton is the built-in SkeletonFallback rendered by Suspense.
    // It has aria-hidden="true" and the class "animate-pulse".
    render(<WidgetContainer pluginId="crm" widgetName="SalesChart" title="Monthly Sales" />);

    // Section must still be in the document
    const section = screen.getByRole('region', { name: 'Monthly Sales' });
    expect(section).toBeInTheDocument();

    // Built-in skeleton: animate-pulse, aria-hidden (not focusable)
    const skeleton = section.querySelector('.animate-pulse');
    expect(skeleton).not.toBeNull();
    expect(skeleton).toHaveAttribute('aria-hidden', 'true');
  });

  // ---- Test 3 ---------------------------------------------------------------
  // Import failure path: loadWidget's React.lazy catch returns BuiltInFallback
  // which renders <WidgetFallback> (data-testid="widget-unavailable").
  // The PluginErrorBoundary / errorFallback prop is only triggered by render-time
  // errors thrown by the widget component itself (not import failures).
  it('renders widget-unavailable fallback when the widget cannot be imported', async () => {
    await act(async () => {
      render(<WidgetContainer pluginId="crm" widgetName="BrokenWidget" title="Broken Widget" />);
    });

    // loadWidget's internal catch handles the import error and returns
    // BuiltInFallback → WidgetFallback renders with data-testid="widget-unavailable"
    const fallback = await screen.findByTestId('widget-unavailable');
    expect(fallback).toBeInTheDocument();
    expect(fallback).toHaveTextContent('crm');
    expect(fallback).toHaveTextContent('BrokenWidget');
  });

  // ---- Test 4 ---------------------------------------------------------------
  // Same import-failure path — no custom errorFallback provided.
  // Confirms widget-unavailable is shown (the default import-failure fallback).
  it('renders widget-unavailable with plugin debug info when no custom errorFallback provided', async () => {
    await act(async () => {
      render(
        <WidgetContainer pluginId="analytics" widgetName="Dashboard" title="Dashboard Widget" />
      );
    });

    const fallback = await screen.findByTestId('widget-unavailable');
    expect(fallback).toBeInTheDocument();
    expect(fallback).toHaveTextContent('analytics');
    expect(fallback).toHaveTextContent('Dashboard');
  });

  // ---- Test 5 ---------------------------------------------------------------
  it('renders a custom loading fallback while loading', () => {
    const customFallback = <div data-testid="custom-loader">Custom loading…</div>;

    // Use a unique pluginId/widgetName combination that has NOT been used in
    // prior tests to ensure the module-level _widgetComponentCache has no
    // entry for this key. A cached (already-resolved) lazy component skips
    // Suspense entirely, so the custom fallback would never render.
    render(
      <WidgetContainer
        pluginId="test-unique-plugin"
        widgetName="UniqueWidget"
        title="Unique Widget"
        fallback={customFallback}
      />
    );

    // Before the promise resolves the Suspense renders the custom fallback
    expect(screen.getByTestId('custom-loader')).toBeInTheDocument();
  });
});
