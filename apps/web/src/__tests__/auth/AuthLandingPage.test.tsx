// apps/web/src/__tests__/auth/AuthLandingPage.test.tsx
//
// Tests for AuthLandingPage / LoginPage (Spec 002, T7-11).
// Covers all 7 states: idle, loading skeleton, redirecting,
//                      rate-limited, keycloak-error, not-found, suspended.
// Also verifies keyboard accessibility and ARIA attributes.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockNavigate = vi.fn();

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => () => null,
  useNavigate: () => mockNavigate,
}));

// Mutable auth store state
let mockIsAuthenticated = false;
let mockIsLoading = false;

vi.mock('@/stores/auth.store', () => ({
  useAuthStore: vi.fn(() => ({
    isAuthenticated: mockIsAuthenticated,
    isLoading: mockIsLoading,
  })),
}));

// Mock getLoginUrl — controllable per test
const mockGetLoginUrl = vi.fn();

vi.mock('@/lib/auth-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth-client')>();
  return {
    ...actual,
    getLoginUrl: (...args: unknown[]) => mockGetLoginUrl(...args),
  };
});

// Mock tenant helper — default non-admin hostname
vi.mock('@/lib/tenant', () => ({
  getTenantFromUrl: vi.fn(() => 'acme-corp'),
}));

// Control window.location so we can simulate hostname + href assignment
const hrefSetter = vi.fn();

// Import after mocks are in place
import { LoginPage as AuthLandingPage } from '@/routes/login';

// ---------------------------------------------------------------------------
// Helper — render with default tenant hostname
// ---------------------------------------------------------------------------
function renderLoginPage(search = '') {
  Object.defineProperty(window, 'location', {
    value: {
      hostname: 'acme-corp.plexica.app',
      origin: 'http://acme-corp.plexica.app',
      search,
      set href(v: string) {
        hrefSetter(v);
      },
    },
    writable: true,
    configurable: true,
  });
  return render(<AuthLandingPage />);
}

describe('AuthLandingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAuthenticated = false;
    mockIsLoading = false;
  });

  // ---------------------------------------------------------------------------
  // State 1 — Idle (default)
  // ---------------------------------------------------------------------------
  describe('State 1: idle', () => {
    it('should render "Welcome back" heading for tenant variant', () => {
      renderLoginPage();
      expect(screen.getByRole('heading', { name: /welcome back/i })).toBeInTheDocument();
    });

    it('should render the Sign In button', () => {
      renderLoginPage();
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    });

    it('should display the tenant slug in the subtitle', () => {
      renderLoginPage();
      expect(screen.getByText(/sign in to acme-corp/i)).toBeInTheDocument();
    });

    it('should have role="main" with accessible label', () => {
      renderLoginPage();
      expect(screen.getByRole('main', { name: /sign in to your workspace/i })).toBeInTheDocument();
    });

    it('should have Sign In button with aria-label', () => {
      renderLoginPage();
      const btn = screen.getByRole('button', { name: /sign in with your account/i });
      expect(btn).toBeInTheDocument();
    });

    it('should have minimum 44px height on the sign-in button (touch target)', () => {
      renderLoginPage();
      const btn = screen.getByRole('button', { name: /sign in with your account/i });
      expect(btn).toHaveClass('min-h-[44px]');
    });
  });

  // ---------------------------------------------------------------------------
  // State 2 — Loading skeleton (isLoading=true)
  // ---------------------------------------------------------------------------
  describe('State 2: loading skeleton', () => {
    it('should render animate-pulse skeleton when isLoading=true', () => {
      mockIsLoading = true;
      renderLoginPage();
      const pulsingEls = document.querySelectorAll('.animate-pulse');
      expect(pulsingEls.length).toBeGreaterThan(0);
    });

    it('should NOT render the Sign In button while loading', () => {
      mockIsLoading = true;
      renderLoginPage();
      expect(screen.queryByRole('button', { name: /sign in/i })).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // State 3 — Redirecting (after Sign In clicked)
  // ---------------------------------------------------------------------------
  describe('State 3: redirecting', () => {
    it('should show "Redirecting…" and spinner inside the button after click', async () => {
      mockGetLoginUrl.mockReturnValue(new Promise(() => {})); // never resolves
      renderLoginPage();

      const btn = screen.getByRole('button', { name: /sign in with your account/i });
      fireEvent.click(btn);

      await waitFor(() => expect(screen.getByText(/redirecting/i)).toBeInTheDocument());
    });

    it('should disable the button while redirecting', async () => {
      mockGetLoginUrl.mockReturnValue(new Promise(() => {}));
      renderLoginPage();

      const btn = screen.getByRole('button', { name: /sign in with your account/i });
      fireEvent.click(btn);

      await waitFor(() => expect(btn).toBeDisabled());
    });

    it('should set aria-busy=true while redirecting', async () => {
      mockGetLoginUrl.mockReturnValue(new Promise(() => {}));
      renderLoginPage();

      const btn = screen.getByRole('button', { name: /sign in with your account/i });
      fireEvent.click(btn);

      await waitFor(() => expect(btn).toHaveAttribute('aria-busy', 'true'));
    });

    it('should redirect window.location.href to the auth URL on success', async () => {
      mockGetLoginUrl.mockResolvedValueOnce('https://keycloak.example.com/auth');
      renderLoginPage();

      fireEvent.click(screen.getByRole('button', { name: /sign in with your account/i }));

      await waitFor(() =>
        expect(hrefSetter).toHaveBeenCalledWith('https://keycloak.example.com/auth')
      );
    });
  });

  // ---------------------------------------------------------------------------
  // State 4 — Rate limited (HTTP 429)
  // ---------------------------------------------------------------------------
  describe('State 4: rate limited', () => {
    it('should show RateLimitCountdown when 429 is returned', async () => {
      const { AuthClientError } = await import('@/lib/auth-client');
      mockGetLoginUrl.mockRejectedValueOnce(
        new AuthClientError(429, 'RATE_LIMITED', 'Too many requests')
      );

      renderLoginPage();
      fireEvent.click(screen.getByRole('button', { name: /sign in with your account/i }));

      await waitFor(() =>
        expect(screen.getByText(/too many sign-in attempts/i)).toBeInTheDocument()
      );
    });

    it('should disable Sign In button while rate limit countdown is active', async () => {
      const { AuthClientError } = await import('@/lib/auth-client');
      mockGetLoginUrl.mockRejectedValueOnce(new AuthClientError(429, 'RATE_LIMITED', 'Too many'));

      renderLoginPage();
      fireEvent.click(screen.getByRole('button', { name: /sign in with your account/i }));

      await waitFor(() => {
        const btn = screen.getByRole('button', { name: /sign in with your account/i });
        expect(btn).toBeDisabled();
      });
    });
  });

  // ---------------------------------------------------------------------------
  // State 5 — Keycloak unavailable
  // ---------------------------------------------------------------------------
  describe('State 5: keycloak error', () => {
    it('should show keycloak-error alert when non-429/404/403 error occurs', async () => {
      mockGetLoginUrl.mockRejectedValueOnce(new Error('Network error'));

      renderLoginPage();
      fireEvent.click(screen.getByRole('button', { name: /sign in with your account/i }));

      await waitFor(() =>
        expect(screen.getByText(/authentication service unavailable/i)).toBeInTheDocument()
      );
    });

    it('should change button text to "Retry sign in" after keycloak error', async () => {
      mockGetLoginUrl.mockRejectedValueOnce(new Error('Network error'));

      renderLoginPage();
      fireEvent.click(screen.getByRole('button', { name: /sign in with your account/i }));

      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: /sign in with your account/i })
        ).toHaveTextContent('Retry sign in')
      );
    });

    it('should show keycloak-error alert as role="alert"', async () => {
      mockGetLoginUrl.mockRejectedValueOnce(new Error('Network error'));

      renderLoginPage();
      fireEvent.click(screen.getByRole('button', { name: /sign in with your account/i }));

      await waitFor(() => {
        const alerts = screen.getAllByRole('alert');
        expect(alerts.length).toBeGreaterThan(0);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // State 6 — Tenant not found (404)
  // ---------------------------------------------------------------------------
  describe('State 6: tenant not found', () => {
    it('should render AuthErrorPage with not-found variant on 404', async () => {
      const { AuthClientError } = await import('@/lib/auth-client');
      mockGetLoginUrl.mockRejectedValueOnce(
        new AuthClientError(404, 'TENANT_NOT_FOUND', 'Not found')
      );

      renderLoginPage();
      fireEvent.click(screen.getByRole('button', { name: /sign in with your account/i }));

      await waitFor(() =>
        expect(screen.getByRole('heading', { name: /tenant not found/i })).toBeInTheDocument()
      );
    });
  });

  // ---------------------------------------------------------------------------
  // State 7 — Tenant suspended (403)
  // ---------------------------------------------------------------------------
  describe('State 7: tenant suspended', () => {
    it('should render AuthErrorPage with suspended variant on 403', async () => {
      const { AuthClientError } = await import('@/lib/auth-client');
      mockGetLoginUrl.mockRejectedValueOnce(
        new AuthClientError(403, 'AUTH_TENANT_SUSPENDED', 'Suspended')
      );

      renderLoginPage();
      fireEvent.click(screen.getByRole('button', { name: /sign in with your account/i }));

      await waitFor(() =>
        expect(screen.getByRole('heading', { name: /account suspended/i })).toBeInTheDocument()
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Admin variant (Screen 10)
  // ---------------------------------------------------------------------------
  describe('admin variant', () => {
    it('should render "Plexica Admin" heading on localhost', () => {
      Object.defineProperty(window, 'location', {
        value: {
          hostname: 'localhost',
          origin: 'http://localhost:5173',
          search: '',
          get href() {
            return '';
          },
          set href(v) {
            hrefSetter(v);
          },
        },
        writable: true,
        configurable: true,
      });
      render(<AuthLandingPage />);
      expect(screen.getByRole('heading', { name: /plexica admin/i })).toBeInTheDocument();
    });

    it('should render super-admin label on localhost', () => {
      Object.defineProperty(window, 'location', {
        value: {
          hostname: 'localhost',
          origin: 'http://localhost:5173',
          search: '',
          get href() {
            return '';
          },
          set href(v) {
            hrefSetter(v);
          },
        },
        writable: true,
        configurable: true,
      });
      render(<AuthLandingPage />);
      expect(screen.getByRole('main', { name: /super admin sign in/i })).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Cross-tenant alert (Screen 7 — ?error=cross_tenant)
  // ---------------------------------------------------------------------------
  describe('cross-tenant alert', () => {
    it('should show cross-tenant alert when error=cross_tenant is in search params', () => {
      renderLoginPage('?error=cross_tenant');
      expect(screen.getByText(/you are signed in to a different workspace/i)).toBeInTheDocument();
    });

    it('should NOT show cross-tenant alert when error param is absent', () => {
      renderLoginPage();
      expect(
        screen.queryByText(/you are signed in to a different workspace/i)
      ).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Redirect when already authenticated
  // ---------------------------------------------------------------------------
  describe('authenticated redirect', () => {
    it('should call navigate to "/" when already authenticated', async () => {
      mockIsAuthenticated = true;
      mockIsLoading = false;

      renderLoginPage();

      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith({ to: '/', replace: true }));
    });
  });

  // ---------------------------------------------------------------------------
  // Keyboard accessibility
  // ---------------------------------------------------------------------------
  describe('keyboard accessibility', () => {
    it('should trigger sign in on Enter key on the Sign In button', async () => {
      mockGetLoginUrl.mockReturnValue(new Promise(() => {}));
      renderLoginPage();

      const btn = screen.getByRole('button', { name: /sign in with your account/i });
      btn.focus();
      fireEvent.keyDown(btn, { key: 'Enter' });
      fireEvent.click(btn); // Simulate browser Enter→click

      await waitFor(() => expect(mockGetLoginUrl).toHaveBeenCalled());
    });

    it('should not fire sign in when button is disabled (rate limited)', async () => {
      const { AuthClientError } = await import('@/lib/auth-client');
      mockGetLoginUrl.mockRejectedValueOnce(new AuthClientError(429, 'RATE_LIMITED', 'Too many'));

      renderLoginPage();
      fireEvent.click(screen.getByRole('button', { name: /sign in with your account/i }));

      await waitFor(() => screen.getByText(/too many sign-in attempts/i));

      mockGetLoginUrl.mockClear();
      const btn = screen.getByRole('button', { name: /sign in with your account/i });
      fireEvent.click(btn); // Should be a no-op

      // No new call was made
      expect(mockGetLoginUrl).not.toHaveBeenCalled();
    });
  });
});
