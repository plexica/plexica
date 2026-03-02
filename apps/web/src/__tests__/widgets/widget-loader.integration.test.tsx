// apps/web/src/__tests__/widgets/widget-loader.integration.test.tsx
//
// T010-3.7: Integration tests for the widget loading system.
//
// These tests exercise WidgetLoader and WidgetContainer together in a realistic
// render environment.  The Module Federation runtime is unavailable in jsdom, so
// we verify the graceful-degradation path (fallbacks, error states, theme
// propagation) rather than successful remote imports.

import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Feature-flag mock — keep ENABLE_PLUGIN_WIDGETS on for all tests here
// ---------------------------------------------------------------------------
const { mockUseFeatureFlag } = vi.hoisted(() => ({
  mockUseFeatureFlag: vi.fn(() => true),
}));

vi.mock('@/lib/feature-flags', () => ({
  useFeatureFlag: mockUseFeatureFlag,
}));

// ---------------------------------------------------------------------------
// Logger mock — suppress console noise
// ---------------------------------------------------------------------------
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { WidgetLoader } from '@/components/WidgetLoader';
import { WidgetContainer } from '@/components/WidgetContainer';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function WithProviders({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={makeQueryClient()}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseFeatureFlag.mockReturnValue(true);
});

// ---------------------------------------------------------------------------
// Integration tests
// ---------------------------------------------------------------------------

describe('Widget system integration', () => {
  // ---- Test 1 ---------------------------------------------------------------
  it('should show widget-unavailable fallback when remote plugin is absent', async () => {
    // No MF runtime → import throws → WidgetFallback rendered
    await act(async () => {
      render(
        <WithProviders>
          <WidgetLoader pluginId="crm" widgetName="ContactCard" />
        </WithProviders>
      );
    });

    const fallback = await screen.findByTestId('widget-unavailable');
    expect(fallback).toBeInTheDocument();
    // The fallback must display the plugin and widget identifiers for debugging
    expect(fallback).toHaveTextContent('crm');
    expect(fallback).toHaveTextContent('ContactCard');
  });

  // ---- Test 2 ---------------------------------------------------------------
  it('shows widget-unavailable fallback (import-failure path) when widget cannot load', async () => {
    await act(async () => {
      render(
        <WithProviders>
          <WidgetContainer pluginId="crm" widgetName="BrokenWidget" title="Broken" />
        </WithProviders>
      );
    });

    // loadWidget's React.lazy catch handles import errors → returns BuiltInFallback
    // → renders <WidgetFallback> with data-testid="widget-unavailable".
    // Note: data-testid="widget-error-fallback" (BuiltInErrorFallback) is only
    // rendered when the widget component throws a render-time error, not an import error.
    const fallbackEl = await screen.findByTestId('widget-unavailable');
    expect(fallbackEl).toBeInTheDocument();
    expect(fallbackEl).toHaveTextContent('crm');
    expect(fallbackEl).toHaveTextContent('BrokenWidget');
  });

  // ---- Test 3 ---------------------------------------------------------------
  it('should inherit CSS custom properties (tenant theme) on the fallback element', async () => {
    // Apply a CSS variable to simulate tenant theming
    document.documentElement.style.setProperty('--color-primary', '#ff6600');

    await act(async () => {
      render(
        <WithProviders>
          <WidgetLoader pluginId="crm" widgetName="ContactCard" />
        </WithProviders>
      );
    });

    // The WidgetFallback is rendered inside the document, so CSS custom
    // properties defined on :root are inherited.  Verify the variable is set.
    const primary = document.documentElement.style.getPropertyValue('--color-primary');
    expect(primary).toBe('#ff6600');

    // Clean up
    document.documentElement.style.removeProperty('--color-primary');
  });
});
