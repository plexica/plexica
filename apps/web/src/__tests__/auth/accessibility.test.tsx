// apps/web/src/__tests__/auth/accessibility.test.tsx
//
// T7-14: WCAG 2.1 AA accessibility audit for all auth screens.
// Uses axe-core via vitest-axe to catch automated accessibility violations.
//
// Screens covered:
//  - Screen 1: LoginPage (idle, loading/skeleton states)
//  - Screen 2: AuthCallbackPage (loading state)
//  - Screen 3: SessionExpiredModal (open + closed)
//  - Screen 4/5/8: AuthErrorPage (not-found, suspended, keycloak-error variants)
//  - Screen 6: RateLimitCountdown (inline component)

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { render } from '@testing-library/react';
import { configureAxe } from 'vitest-axe';

// Import the runtime matcher function to register with expect.extend()
// vitest-axe/extend-expect.js is empty (package bug), so we register manually.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { toHaveNoViolations } = (await import('vitest-axe/matchers')) as any;
expect.extend({ toHaveNoViolations });

// Type-safe helper — avoids repeating `as any` at every assertion site
 
function expectNoViolations(results: unknown): void {
  (expect(results) as any).toHaveNoViolations();
}

// ---------------------------------------------------------------------------
// Configure axe — disable rules that don't work in jsdom
// ---------------------------------------------------------------------------

const axe = configureAxe({
  rules: {
    // CSS custom properties (vars) are not resolved in jsdom
    'color-contrast': { enabled: false },
    // Full-screen single-component pages don't need landmark regions
    region: { enabled: false },
  },
});

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => () => ({ component: null }),
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children: React.ReactNode }) => <a href="#">{children}</a>,
}));

vi.mock('@/stores/auth.store', () => ({
  useAuthStore: vi.fn(() => ({
    isAuthenticated: false,
    isLoading: false,
    setTokens: vi.fn(),
    consumeDeepLink: vi.fn(() => null),
    setError: vi.fn(),
    saveDeepLink: vi.fn(),
  })),
}));

vi.mock('@/lib/auth-client', () => ({
  getLoginUrl: vi.fn(),
  exchangeCode: vi.fn(),
  AuthClientError: class AuthClientError extends Error {
    status: number;
    code: string;
    constructor(message: string, status: number, code: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
}));

vi.mock('@/lib/tenant', () => ({
  getTenantFromUrl: vi.fn(() => 'acme-corp'),
}));

// Silence non-actionable React / jsdom console noise during axe analysis
const originalError = console.error;
const originalWarn = console.warn;
beforeAll(() => {
  console.error = vi.fn();
  console.warn = vi.fn();
});
afterAll(() => {
  console.error = originalError;
  console.warn = originalWarn;
});

// ---------------------------------------------------------------------------
// Screen 4 / 5 / 8: AuthErrorPage
// ---------------------------------------------------------------------------

describe('AuthErrorPage — WCAG 2.1 AA', () => {
  it('has no violations — not-found variant', async () => {
    const { AuthErrorPage } = await import('@/components/auth/AuthErrorPage');
    const { container } = render(<AuthErrorPage variant="not-found" slug="acme-corp" />);
    expectNoViolations(await axe(container));
  });

  it('has no violations — suspended variant', async () => {
    const { AuthErrorPage } = await import('@/components/auth/AuthErrorPage');
    const { container } = render(<AuthErrorPage variant="suspended" />);
    expectNoViolations(await axe(container));
  });

  it('has no violations — keycloak-error with retry button', async () => {
    const { AuthErrorPage } = await import('@/components/auth/AuthErrorPage');
    const { container } = render(
      <AuthErrorPage variant="keycloak-error" showRetry onRetry={vi.fn()} />
    );
    expectNoViolations(await axe(container));
  });

  it('has no violations — not-found with tenant logo', async () => {
    const { AuthErrorPage } = await import('@/components/auth/AuthErrorPage');
    const { container } = render(
      <AuthErrorPage
        variant="not-found"
        slug="acme-corp"
        tenantLogoUrl="https://example.com/logo.png"
      />
    );
    expectNoViolations(await axe(container));
  });
});

// ---------------------------------------------------------------------------
// Screen 6: RateLimitCountdown
// ---------------------------------------------------------------------------

describe('RateLimitCountdown — WCAG 2.1 AA', () => {
  it('has no violations', async () => {
    const { RateLimitCountdown } = await import('@/components/auth/RateLimitCountdown');
    const { container } = render(<RateLimitCountdown retryAfterSeconds={90} onExpired={vi.fn()} />);
    expectNoViolations(await axe(container));
  });
});

// ---------------------------------------------------------------------------
// Screen 3: SessionExpiredModal
// ---------------------------------------------------------------------------

describe('SessionExpiredModal — WCAG 2.1 AA', () => {
  it('has no violations when open', async () => {
    const { SessionExpiredModal } = await import('@/components/auth/SessionExpiredModal');
    const { container } = render(<SessionExpiredModal isOpen={true} />);
    expectNoViolations(await axe(container));
  });

  it('has no violations when closed (renders nothing)', async () => {
    const { SessionExpiredModal } = await import('@/components/auth/SessionExpiredModal');
    const { container } = render(<SessionExpiredModal isOpen={false} />);
    expectNoViolations(await axe(container));
  });
});

// ---------------------------------------------------------------------------
// Screen 2: AuthCallbackPage — loading state
// ---------------------------------------------------------------------------

describe('AuthCallbackPage — WCAG 2.1 AA', () => {
  it('has no violations in the loading state', async () => {
    // No ?code param in jsdom URL → effect navigates away immediately.
    // We only audit the initial render (the accessible loading spinner).
    const { AuthCallbackPage } = await import('@/routes/auth/callback');
    const { container } = render(<AuthCallbackPage />);
    expectNoViolations(await axe(container));
  });
});

// ---------------------------------------------------------------------------
// Screen 1: LoginPage — idle and skeleton states
// ---------------------------------------------------------------------------

describe('LoginPage — WCAG 2.1 AA', () => {
  it('has no violations — idle state', async () => {
    const { useAuthStore } = await import('@/stores/auth.store');
    vi.mocked(useAuthStore).mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      setTokens: vi.fn(),
      consumeDeepLink: vi.fn(() => null),
      setError: vi.fn(),
      saveDeepLink: vi.fn(),
    } as any);

    const { LoginPage } = await import('@/routes/login');
    const { container } = render(<LoginPage />);
    expectNoViolations(await axe(container));
  });

  it('has no violations — loading skeleton state', async () => {
    const { useAuthStore } = await import('@/stores/auth.store');
    vi.mocked(useAuthStore).mockReturnValue({
      isAuthenticated: false,
      isLoading: true,
      setTokens: vi.fn(),
      consumeDeepLink: vi.fn(() => null),
      setError: vi.fn(),
      saveDeepLink: vi.fn(),
    } as any);

    const { LoginPage } = await import('@/routes/login');
    const { container } = render(<LoginPage />);
    expectNoViolations(await axe(container));
  });
});
