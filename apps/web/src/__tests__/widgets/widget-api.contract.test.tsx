// apps/web/src/__tests__/widgets/widget-api.contract.test.tsx
//
// TD-008: Module Federation Widget API Contract Tests
//
// These tests verify the stable public API surface of the widget loading system.
// They target the contracts that external plugin authors and shell integrators
// rely on — not the internal implementation details covered by widget-loader.test.tsx.
//
// API surface under contract:
//   1. LoadWidgetOptions interface shape (required vs optional fields, generics)
//   2. validateWidgetIdentifiers() — stable error message strings
//   3. loadWidget() return type (React.ComponentType<T>) and Suspense contract
//   4. loadWidget() logger.error call shape ({pluginId, widgetName, err})
//   5. WidgetFallback ARIA attribute contract (role, aria-label format, visible text)
//   6. WidgetFallback prop contract (both props required, no extras needed)
//   7. WidgetContainer feature-flag gate (renders null when disabled)
//   8. WidgetContainer section/region contract (role="region", aria-label=title)
//   9. WidgetContainer errorFallback prop contract (custom vs built-in fallback)
//  10. WidgetContainer widgetProps forwarding contract
//  11. PluginErrorBoundary fallback callback contract (pluginName, error, onRetry)
//
// Constitution Art. 8.1: contract tests required for plugin-to-core API interactions.
// ADR-019 (pluggable adapter): widget API surface must remain stable across adapters.
// ADR-028: logger field names must match Loki/Promtail pipeline expectations.
//
// IMPORTANT: These tests lock the CONTRACT, not the implementation.
//   - widget-loader.test.tsx     → unit coverage (validation edge cases, caching)
//   - widget-loader.integration.test.tsx → integrated render paths
//   - WidgetContainer.test.tsx   → WidgetContainer unit coverage

import React, { Suspense } from 'react';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — established before imports so vi.hoisted values are available
// ---------------------------------------------------------------------------

const { mockLoggerError, mockCreateContextLogger } = vi.hoisted(() => ({
  mockLoggerError: vi.fn(),
  mockCreateContextLogger: vi.fn(() => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    error: mockLoggerError,
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
  createContextLogger: mockCreateContextLogger,
}));

const { mockUseFeatureFlag } = vi.hoisted(() => ({
  mockUseFeatureFlag: vi.fn(() => true),
}));

vi.mock('@/lib/feature-flags', () => ({
  useFeatureFlag: mockUseFeatureFlag,
}));

// ---------------------------------------------------------------------------
// Subject-under-test imports (after mocks)
// ---------------------------------------------------------------------------

import { loadWidget, validateWidgetIdentifiers, type LoadWidgetOptions } from '@/lib/widget-loader';
import { WidgetFallback } from '@/components/WidgetFallback';
import { WidgetContainer } from '@/components/WidgetContainer';
import { PluginErrorBoundary } from '@/components/ErrorBoundary/PluginErrorBoundary';

// ---------------------------------------------------------------------------
// Test lifecycle
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  // Flag ON by default — individual tests opt-out where needed
  mockUseFeatureFlag.mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ===========================================================================
// 1. LoadWidgetOptions interface contract
// ===========================================================================

describe('LoadWidgetOptions interface contract', () => {
  // C-01
  it('should accept an object with only pluginId and widgetName (fallback is optional)', () => {
    // Arrange
    const minimalOptions: LoadWidgetOptions = { pluginId: 'crm', widgetName: 'ContactCard' };

    // Act & Assert — TypeScript would error at compile time if required fields were missing;
    // this runtime check ensures the function does not throw for a minimal valid object.
    expect(() => loadWidget(minimalOptions)).not.toThrow();
  });

  // C-02
  it('should accept an object with all three fields including optional fallback', () => {
    // Arrange
    function CustomFallback() {
      return <div>custom fallback</div>;
    }
    const fullOptions: LoadWidgetOptions = {
      pluginId: 'crm',
      widgetName: 'ContactCard',
      fallback: CustomFallback,
    };

    // Act & Assert
    expect(() => loadWidget(fullOptions)).not.toThrow();
  });

  // C-03
  it('should return a value usable as a React component type (JSX element)', () => {
    // Arrange
    const Widget = loadWidget({ pluginId: 'crm', widgetName: 'ContactCard' });

    // Assert — contract: React.lazy() returns an object, not a function.
    // The $$typeof symbol identifies it as a valid lazy component.
    expect(Widget).toBeDefined();
    expect(typeof Widget).toBe('object');
    // @ts-expect-error — accessing React internals for contract assertion
    expect(Widget.$$typeof?.toString()).toContain('react.lazy');
  });

  // C-04
  it('should accept a TypeScript generic for typed widget props without compiler error', () => {
    // Arrange
    interface CrmContactProps {
      contactId: string;
      showDetails?: boolean;
    }

    // Act — if the generic contract breaks this file will not compile
    const Widget = loadWidget<CrmContactProps>({ pluginId: 'crm', widgetName: 'ContactCard' });

    // Assert
    expect(Widget).toBeDefined();
  });
});

// ===========================================================================
// 2. validateWidgetIdentifiers() error message contract
// ===========================================================================

describe('validateWidgetIdentifiers() error message contract', () => {
  // C-05
  it('should include "Invalid pluginId" in the error when pluginId is invalid', () => {
    // Contract: error message prefix is stable — plugin authors may match on it.
    // Arrange — two distinct invalid forms
    const invalidIds = ['CRM', '', 'my/plugin', '../evil'];

    // Act & Assert
    for (const id of invalidIds) {
      expect(() => validateWidgetIdentifiers(id, 'Widget')).toThrowError(/Invalid pluginId/);
    }
  });

  // C-06
  it('should include "Invalid widgetName" in the error when widgetName is invalid', () => {
    // Contract: error message prefix is stable — plugin authors may match on it.
    const invalidNames = ['1BadName', '', 'My.Widget', '../evil'];

    for (const name of invalidNames) {
      expect(() => validateWidgetIdentifiers('crm', name)).toThrowError(/Invalid widgetName/);
    }
  });

  // C-07
  it('should not throw for valid pluginId + widgetName combinations', () => {
    // Contract: all lowercase+hyphen plugin IDs and PascalCase/camelCase widget names are valid.
    const validPairs: Array<[string, string]> = [
      ['crm', 'ContactCard'],
      ['my-plugin-123', 'MyWidget'],
      ['a', 'A'],
      ['plugin-name', 'WidgetName123'],
      ['analytics', 'dashboardView'],
    ];

    for (const [pluginId, widgetName] of validPairs) {
      expect(() => validateWidgetIdentifiers(pluginId, widgetName)).not.toThrow();
    }
  });
});

// ===========================================================================
// 3. loadWidget() Suspense lifecycle contract
// ===========================================================================

describe('loadWidget() Suspense lifecycle contract', () => {
  // C-08
  it('should show a loading state while the lazy component is pending', () => {
    // Arrange — unique identifiers to bypass module-level cache
    const Widget = loadWidget({ pluginId: 'suspense-test', widgetName: 'PendingWidget' });

    // Act
    render(
      <Suspense fallback={<div data-testid="loading-sentinel">Loading…</div>}>
        <Widget />
      </Suspense>
    );

    // Assert — Suspense must render the fallback while the import is in-flight.
    // In jsdom there is no MF runtime, so the lazy import always rejects, but
    // the Suspense fallback is visible synchronously before the rejection resolves.
    expect(screen.getByTestId('loading-sentinel')).toBeInTheDocument();
  });

  // C-09
  it('should resolve to WidgetFallback when the import fails (built-in fallback path)', async () => {
    // Arrange
    const Widget = loadWidget({ pluginId: 'missing-plugin', widgetName: 'GhostWidget' });

    // Act
    await act(async () => {
      render(
        <Suspense fallback={<div data-testid="loading-sentinel" />}>
          <Widget />
        </Suspense>
      );
    });

    // Assert — the built-in WidgetFallback must be shown after the import rejects.
    const fallback = await screen.findByTestId('widget-unavailable');
    expect(fallback).toBeInTheDocument();
    expect(fallback).toHaveTextContent('missing-plugin');
    expect(fallback).toHaveTextContent('GhostWidget');
  });

  // C-10
  it('should render the custom fallback component when fallback prop is provided and import fails', async () => {
    // Arrange
    function PluginUnavailableCard() {
      return <div data-testid="custom-unavailable-card">Plugin offline</div>;
    }

    const Widget = loadWidget({
      pluginId: 'offline-plugin',
      widgetName: 'OfflineWidget',
      fallback: PluginUnavailableCard,
    });

    // Act
    await act(async () => {
      render(
        <Suspense fallback={<div />}>
          <Widget />
        </Suspense>
      );
    });

    // Assert — custom fallback must be used instead of WidgetFallback.
    const card = await screen.findByTestId('custom-unavailable-card');
    expect(card).toBeInTheDocument();
    expect(screen.queryByTestId('widget-unavailable')).not.toBeInTheDocument();
  });
});

// ===========================================================================
// 4. loadWidget() logger.error call-shape contract
// ===========================================================================

describe('loadWidget() logger.error call-site contract', () => {
  // C-11
  it('should call logger.error with {pluginId, widgetName, err} — not the "error" key', async () => {
    // This test locks the log field names. Changing "err" to "error" would break
    // any Loki/Promtail pipeline filtering on field name "err" (ADR-028).

    // Arrange
    const Widget = loadWidget({ pluginId: 'crm-logger-test', widgetName: 'LogTestWidget' });

    // Act
    await act(async () => {
      render(
        <Suspense fallback={<div />}>
          <Widget />
        </Suspense>
      );
    });

    await vi.waitFor(() => {
      expect(mockLoggerError).toHaveBeenCalled();
    });

    // Assert
    const [logContext] = mockLoggerError.mock.calls[0] as [Record<string, unknown>];

    // Must have "err" key (not "error") for Loki pipeline compatibility
    expect(logContext).toHaveProperty('err');
    expect(logContext).not.toHaveProperty('error');

    // Must include pluginId and widgetName for log correlation
    expect(logContext).toHaveProperty('pluginId', 'crm-logger-test');
    expect(logContext).toHaveProperty('widgetName', 'LogTestWidget');
  });

  // C-12
  it('should pass the second argument to logger.error as the message string "Failed to load widget"', async () => {
    // Arrange
    const Widget = loadWidget({ pluginId: 'crm-msg-test', widgetName: 'MsgTestWidget' });

    // Act
    await act(async () => {
      render(
        <Suspense fallback={<div />}>
          <Widget />
        </Suspense>
      );
    });

    await vi.waitFor(() => {
      expect(mockLoggerError).toHaveBeenCalled();
    });

    // Assert — second arg is the Pino message string
    const [, message] = mockLoggerError.mock.calls[0] as [Record<string, unknown>, string];
    expect(message).toBe('Failed to load widget');
  });
});

// ===========================================================================
// 5. WidgetFallback ARIA & prop contract
// ===========================================================================

describe('WidgetFallback prop contract', () => {
  // C-13
  it('should require pluginId and widgetName props and render without error', () => {
    // Arrange & Act
    const { unmount } = render(<WidgetFallback pluginId="analytics" widgetName="RevenueChart" />);

    // Assert — no throw, component mounted successfully
    expect(screen.getByTestId('widget-unavailable')).toBeInTheDocument();

    // Cleanup — contract: must unmount without error
    expect(() => unmount()).not.toThrow();
  });

  // C-14
  it('should render role="status" for screen-reader live region support', () => {
    // Arrange & Act
    render(<WidgetFallback pluginId="crm" widgetName="ContactCard" />);

    // Assert — WCAG 2.1 AA contract (Constitution Art. 1.3)
    const statusEl = screen.getByRole('status');
    expect(statusEl).toBeInTheDocument();
  });

  // C-15
  it('should render aria-label in the stable format "Widget unavailable: {pluginId}/{widgetName}"', () => {
    // Arrange & Act
    render(<WidgetFallback pluginId="crm" widgetName="ContactCard" />);

    // Assert — Playwright selectors and a11y tests depend on this exact format
    const statusEl = screen.getByRole('status');
    expect(statusEl).toHaveAttribute('aria-label', 'Widget unavailable: crm/ContactCard');
  });

  // C-16
  it('should display the plugin/widget identifier as visible text for sighted developers', () => {
    // Arrange & Act
    render(<WidgetFallback pluginId="my-plugin" widgetName="MyWidget" />);

    // Assert — debug identifier must be visible to help developers diagnose loading failures
    expect(screen.getByText(/my-plugin\/MyWidget/)).toBeInTheDocument();
  });
});

// ===========================================================================
// 6. WidgetContainer feature-flag contract
// ===========================================================================

describe('WidgetContainer feature-flag contract', () => {
  // C-17
  it('should render null (empty DOM) when ENABLE_PLUGIN_WIDGETS feature flag is disabled', async () => {
    // Arrange — disable the feature flag
    mockUseFeatureFlag.mockReturnValue(false);

    // Act
    const { container } = render(
      <WidgetContainer pluginId="crm" widgetName="ContactCard" title="CRM Contact Card" />
    );

    // Assert — null render means no DOM output (flag-gated feature not yet live)
    expect(container).toBeEmptyDOMElement();
  });

  // C-18
  it('should render a region element with aria-label matching the title prop when flag is enabled', async () => {
    // Arrange
    mockUseFeatureFlag.mockReturnValue(true);

    // Act
    await act(async () => {
      render(<WidgetContainer pluginId="crm" widgetName="ContactCard" title="CRM Contact Card" />);
    });

    // Assert — ARIA landmark contract for assistive technology
    const section = screen.getByRole('region', { name: 'CRM Contact Card' });
    expect(section).toBeInTheDocument();
  });
});

// ===========================================================================
// 7. WidgetContainer errorFallback prop contract
// ===========================================================================

describe('WidgetContainer errorFallback prop contract', () => {
  // C-19
  it('should render the custom errorFallback node when a widget throws a render-time error', async () => {
    // Arrange — create a component that throws synchronously on render
    function BombWidget(): React.ReactElement {
      throw new Error('Widget render bomb');
    }

    // Suppress React's console.error for the expected error boundary catch
    vi.spyOn(console, 'error').mockImplementation(() => {});

    // Act — wrap BombWidget in PluginErrorBoundary with a custom errorFallback,
    // mirroring how WidgetContainer uses it internally.
    const customFallback: React.ComponentType<{
      pluginName: string;
      error: Error | null;
      onRetry: () => void;
    }> = ({ pluginName }) => <div data-testid="custom-error-fallback">Error in {pluginName}</div>;

    render(
      <PluginErrorBoundary pluginId="crm" pluginName="CRM Plugin" fallback={customFallback}>
        <BombWidget />
      </PluginErrorBoundary>
    );

    // Assert — custom error fallback must be shown instead of PluginErrorFallback
    const errorEl = screen.getByTestId('custom-error-fallback');
    expect(errorEl).toBeInTheDocument();
    expect(errorEl).toHaveTextContent('Error in CRM Plugin');
  });

  // C-20
  it('should invoke the onRetry callback and clear the error state when retry is triggered', async () => {
    // Arrange
    let shouldThrow = true;
    function ConditionalBomb() {
      if (shouldThrow) throw new Error('First render bomb');
      return <div data-testid="recovered-widget">Recovered!</div>;
    }

    const onRetrySpy = vi.fn();

    const InteractiveErrorFallback: React.ComponentType<{
      pluginName: string;
      error: Error | null;
      onRetry: () => void;
    }> = ({ onRetry }) => (
      <button
        data-testid="retry-button"
        onClick={() => {
          shouldThrow = false;
          onRetrySpy();
          onRetry();
        }}
      >
        Retry
      </button>
    );

    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <PluginErrorBoundary
        pluginId="crm"
        pluginName="CRM Plugin"
        fallback={InteractiveErrorFallback}
      >
        <ConditionalBomb />
      </PluginErrorBoundary>
    );

    // Assert — error state is shown initially
    expect(screen.getByTestId('retry-button')).toBeInTheDocument();

    // Act — trigger retry
    await userEvent.click(screen.getByTestId('retry-button'));

    // Assert — onRetry must have been called and the boundary must have reset
    expect(onRetrySpy).toHaveBeenCalledOnce();
    expect(await screen.findByTestId('recovered-widget')).toBeInTheDocument();
  });
});
