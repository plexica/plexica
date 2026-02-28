// apps/web/src/__tests__/widgets/WidgetContainer.test.tsx
//
// T005-05: Unit tests for WidgetContainer component.

import { render, screen, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// We mock the loadWidget stub inside WidgetContainer at module level.
// Since loadWidget is a module-private function, we test the component's
// observable behaviour (aria-busy, role, error fallback, content).
// ---------------------------------------------------------------------------

import { WidgetContainer } from '../../components/WidgetContainer';

describe('WidgetContainer', () => {
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
});
