// apps/web/src/test/test-utils.tsx
//
// Shared test utilities for Spec 010 (T010-30).
//
// Exports:
//  - renderWithProviders  — wraps components with all necessary context providers
//  - createMockTheme      — factory for valid TenantTheme test fixtures
//  - createMockPlugin     — factory for valid Plugin test fixtures
//  - createMockAuthUser   — factory for valid AuthUser test fixtures

import React from 'react';
import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import type { TenantTheme } from '@/lib/theme-utils.js';
import type { AuthUser } from '@/stores/auth.store.js';

// ---------------------------------------------------------------------------
// Mock providers
// ---------------------------------------------------------------------------

// Minimal IntlProvider stub — avoids react-intl dependency in unit tests.
function IntlProviderStub({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

// Minimal ThemeProvider stub — no API calls, applies default CSS vars.
function ThemeProviderStub({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

// ---------------------------------------------------------------------------
// renderWithProviders
// ---------------------------------------------------------------------------

interface RenderWithProvidersOptions extends Omit<RenderOptions, 'wrapper'> {
  /** Pre-set QueryClient for tests that need to inspect the cache. */
  queryClient?: QueryClient;
  /** Whether to wrap with IntlProvider stub (default: true). */
  withIntl?: boolean;
  /** Whether to wrap with ThemeProvider stub (default: true). */
  withTheme?: boolean;
}

/**
 * Renders `ui` inside all Plexica providers needed for tests:
 *   QueryClientProvider → ThemeProvider → IntlProvider → ui
 *
 * All providers are stubs/mocks — no real network calls or localStorage side
 * effects. Override per-test by passing `queryClient` or adding MSW handlers.
 */
export function renderWithProviders(
  ui: React.ReactElement,
  {
    queryClient,
    withIntl = true,
    withTheme = true,
    ...renderOptions
  }: RenderWithProvidersOptions = {}
): RenderResult & { queryClient: QueryClient } {
  const client =
    queryClient ??
    new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 0,
          staleTime: 0,
        },
      },
    });

  function Wrapper({ children }: { children: React.ReactNode }) {
    let wrapped: React.ReactNode = children;

    if (withIntl) {
      wrapped = <IntlProviderStub>{wrapped}</IntlProviderStub>;
    }

    if (withTheme) {
      wrapped = <ThemeProviderStub>{wrapped}</ThemeProviderStub>;
    }

    return <QueryClientProvider client={client}>{wrapped}</QueryClientProvider>;
  }

  const result = render(ui, { wrapper: Wrapper, ...renderOptions });

  return { ...result, queryClient: client };
}

// ---------------------------------------------------------------------------
// createMockTheme
// ---------------------------------------------------------------------------

/**
 * Returns a valid TenantTheme fixture. Pass `overrides` to customise specific
 * fields without rewriting the whole object.
 *
 * @example
 * const theme = createMockTheme({ colors: { primary: '#ff0000' } });
 */
export function createMockTheme(overrides?: Partial<TenantTheme>): TenantTheme {
  return {
    logo: 'https://cdn.example.com/logos/test-tenant.png',
    colors: {
      primary: '#1976d2',
      secondary: '#dc004e',
      background: '#ffffff',
      surface: '#f5f5f5',
      text: '#212121',
      textSecondary: '#757575',
      error: '#f44336',
      success: '#4caf50',
      warning: '#ff9800',
      ...overrides?.colors,
    },
    fonts: {
      heading: 'inter',
      body: 'roboto',
      mono: 'roboto-mono',
      ...overrides?.fonts,
    },
    ...overrides,
    // Re-apply nested overrides after spread to handle partial color/font objects
    ...(overrides?.colors !== undefined && {
      colors: { ...createMockTheme().colors, ...overrides.colors },
    }),
    ...(overrides?.fonts !== undefined && {
      fonts: { ...createMockTheme().fonts, ...overrides.fonts },
    }),
  };
}

// ---------------------------------------------------------------------------
// createMockPlugin
// ---------------------------------------------------------------------------

export interface MockPlugin {
  id: string;
  name: string;
  version: string;
  status: 'active' | 'inactive' | 'error';
  remoteUrl: string;
  description?: string;
  widgets?: Array<{ name: string; props: string[]; description?: string }>;
}

/**
 * Returns a valid Plugin fixture for use in tests.
 *
 * @example
 * const plugin = createMockPlugin({ id: 'my-plugin', status: 'inactive' });
 */
export function createMockPlugin(overrides?: Partial<MockPlugin>): MockPlugin {
  return {
    id: 'plugin-crm',
    name: 'CRM',
    version: '1.0.0',
    status: 'active',
    remoteUrl: 'http://localhost:5001/remoteEntry.js',
    description: 'Customer relationship management plugin',
    widgets: [
      {
        name: 'ContactCard',
        props: ['contactId'],
        description: 'Displays a contact summary card',
      },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// createMockAuthUser
// ---------------------------------------------------------------------------

/**
 * Returns a valid AuthUser fixture for use in tests.
 *
 * @example
 * const user = createMockAuthUser({ tenantId: 'acme' });
 */
export function createMockAuthUser(overrides?: Partial<AuthUser>): AuthUser {
  return {
    id: 'user-test-123',
    email: 'test@example.com',
    name: 'Test User',
    displayName: 'Test User',
    roles: ['user'],
    tenantId: 'test-tenant',
    permissions: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// vi.mock helper for @plexica/api-client
// ---------------------------------------------------------------------------

/**
 * Creates a typed mock for the api-client module.
 * Use at the top of test files:
 *
 * @example
 * vi.mock('@/lib/api-client', () => createApiClientMock());
 */
export function createApiClientMock() {
  return {
    default: {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    },
  };
}
