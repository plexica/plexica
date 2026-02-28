// apps/web/src/__tests__/widgets/WidgetContainer.test.tsx
//
// T005-05: Unit tests for WidgetContainer component.

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

// ---------------------------------------------------------------------------
// We mock the loadWidget stub inside WidgetContainer at module level.
// Since loadWidget is a module-private function, we test the component's
// observable behaviour (aria-busy, role, error fallback, content).
// ---------------------------------------------------------------------------

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
  it('shows skeleton (aria-busy="true") while loadWidget promise is pending', () => {
    // Don't await — check loading state immediately
    render(<WidgetContainer pluginId="crm" widgetName="SalesChart" title="Monthly Sales" />);

    const section = screen.getByRole('region', { name: 'Monthly Sales' });
    expect(section).toHaveAttribute('aria-busy', 'true');
  });

  // ---- Test 3 ---------------------------------------------------------------
  it('renders errorFallback when loadWidget rejects', async () => {
    const customError = <div data-testid="custom-error">Widget unavailable</div>;

    await act(async () => {
      render(
        <WidgetContainer
          pluginId="crm"
          widgetName="BrokenWidget"
          title="Broken Widget"
          errorFallback={customError}
        />
      );
    });

    // loadWidget stub always rejects — error fallback should appear
    expect(await screen.findByTestId('custom-error')).toBeInTheDocument();

    // Section should no longer be busy
    const section = screen.getByRole('region', { name: 'Broken Widget' });
    expect(section).toHaveAttribute('aria-busy', 'false');
  });

  // ---- Test 4 ---------------------------------------------------------------
  it('renders built-in WidgetFallback (data-testid="widget-error-fallback") when no custom errorFallback provided', async () => {
    await act(async () => {
      render(<WidgetContainer pluginId="crm" widgetName="BrokenWidget" title="Broken Widget" />);
    });

    // loadWidget stub always rejects — built-in error fallback should appear
    expect(await screen.findByTestId('widget-error-fallback')).toBeInTheDocument();
    expect(screen.getByTestId('widget-error-fallback')).toHaveTextContent('Broken Widget');
  });

  // ---- Test 5 ---------------------------------------------------------------
  it('renders a custom loading fallback while loading', () => {
    const customFallback = <div data-testid="custom-loader">Custom loading…</div>;

    render(
      <WidgetContainer
        pluginId="crm"
        widgetName="SalesChart"
        title="Monthly Sales"
        fallback={customFallback}
      />
    );

    // Before the promise resolves the loading state is active
    expect(screen.getByTestId('custom-loader')).toBeInTheDocument();
  });
});
