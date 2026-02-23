// apps/web/src/__tests__/auth/AuthCallbackPage.test.tsx
//
// Tests for AuthCallbackPage (Spec 002, T7-12).
// Verifies: loading spinner render, ARIA attributes, successful code exchange
//           (tokens stored + navigation), missing code error path, OAuth error param path.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks — must be declared before the component import
// ---------------------------------------------------------------------------

const mockNavigate = vi.fn();

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => () => null,
  useNavigate: () => mockNavigate,
}));

const mockSetTokens = vi.fn();
const mockConsumeDeepLink = vi.fn<() => string | null>(() => null);
const mockSetError = vi.fn();

vi.mock('@/stores/auth.store', () => ({
  useAuthStore: vi.fn(() => ({
    setTokens: mockSetTokens,
    consumeDeepLink: mockConsumeDeepLink,
    setError: mockSetError,
  })),
}));

const mockExchangeCode = vi.fn();

vi.mock('@/lib/auth-client', () => ({
  exchangeCode: (...args: unknown[]) => mockExchangeCode(...args),
}));

// Provide a fake window.location.search for each test
function setSearch(qs: string) {
  Object.defineProperty(window, 'location', {
    value: { ...window.location, search: qs },
    writable: true,
    configurable: true,
  });
}

// ---------------------------------------------------------------------------
// Import after mocks are set up
// ---------------------------------------------------------------------------
import { AuthCallbackPage } from '@/routes/auth/callback';

describe('AuthCallbackPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Loading UI
  // ---------------------------------------------------------------------------
  it('should render a loading spinner with role="status"', () => {
    setSearch('?code=abc123');
    mockExchangeCode.mockReturnValue(new Promise(() => {})); // never resolves
    render(<AuthCallbackPage />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('should have aria-live="polite" on the status container', () => {
    setSearch('?code=abc123');
    mockExchangeCode.mockReturnValue(new Promise(() => {}));
    render(<AuthCallbackPage />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });

  it('should have an accessible label "Signing you in, please wait"', () => {
    setSearch('?code=abc123');
    mockExchangeCode.mockReturnValue(new Promise(() => {}));
    render(<AuthCallbackPage />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Signing you in, please wait');
  });

  it('should display "Signing you in…" text', () => {
    setSearch('?code=abc123');
    mockExchangeCode.mockReturnValue(new Promise(() => {}));
    render(<AuthCallbackPage />);
    expect(screen.getByText(/signing you in/i)).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Successful code exchange
  // ---------------------------------------------------------------------------
  it('should call exchangeCode with the code from search params', async () => {
    setSearch('?code=my-auth-code&state=some-state');
    mockExchangeCode.mockResolvedValueOnce({
      access_token: 'at',
      refresh_token: 'rt',
      expires_in: 3600,
    });

    render(<AuthCallbackPage />);

    await waitFor(() =>
      expect(mockExchangeCode).toHaveBeenCalledWith('my-auth-code', 'some-state')
    );
  });

  it('should call setTokens with the exchanged token set', async () => {
    setSearch('?code=my-auth-code');
    mockExchangeCode.mockResolvedValueOnce({
      access_token: 'access-token-value',
      refresh_token: 'refresh-token-value',
      expires_in: 3600,
    });

    render(<AuthCallbackPage />);

    await waitFor(() =>
      expect(mockSetTokens).toHaveBeenCalledWith(
        expect.objectContaining({
          accessToken: 'access-token-value',
          refreshToken: 'refresh-token-value',
        })
      )
    );
  });

  it('should navigate to "/" after successful token exchange (no deep link)', async () => {
    setSearch('?code=my-auth-code');
    mockConsumeDeepLink.mockReturnValue(null);
    mockExchangeCode.mockResolvedValueOnce({
      access_token: 'at',
      refresh_token: 'rt',
      expires_in: 3600,
    });

    render(<AuthCallbackPage />);

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith({ to: '/', replace: true }));
  });

  it('should navigate to the deep-link URL after successful exchange', async () => {
    setSearch('?code=my-auth-code');
    mockConsumeDeepLink.mockReturnValue('/dashboard?tab=reports');
    mockExchangeCode.mockResolvedValueOnce({
      access_token: 'at',
      refresh_token: 'rt',
      expires_in: 3600,
    });

    render(<AuthCallbackPage />);

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith({ to: '/dashboard?tab=reports', replace: true })
    );
  });

  // ---------------------------------------------------------------------------
  // Error paths
  // ---------------------------------------------------------------------------
  it('should navigate to /auth/error when code is missing from params', async () => {
    setSearch('');

    render(<AuthCallbackPage />);

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith(
        expect.objectContaining({ to: '/auth/error', search: { code: 'MISSING_CODE' } })
      )
    );
  });

  it('should navigate to /auth/error when error param is present', async () => {
    setSearch('?error=access_denied');

    render(<AuthCallbackPage />);

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith(
        expect.objectContaining({ to: '/auth/error', search: { code: 'access_denied' } })
      )
    );
  });

  it('should navigate to /auth/error and call setError when exchangeCode throws', async () => {
    setSearch('?code=bad-code');
    mockExchangeCode.mockRejectedValueOnce(new Error('Exchange failed'));

    render(<AuthCallbackPage />);

    await waitFor(() => expect(mockSetError).toHaveBeenCalled());
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith(expect.objectContaining({ to: '/auth/error' }))
    );
  });

  it('should use the error code from AuthClientError when available', async () => {
    setSearch('?code=bad-code');
    const err = Object.assign(new Error('Keycloak error'), { code: 'KEYCLOAK_UNREACHABLE' });
    mockExchangeCode.mockRejectedValueOnce(err);

    render(<AuthCallbackPage />);

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith(
        expect.objectContaining({
          to: '/auth/error',
          search: { code: 'KEYCLOAK_UNREACHABLE' },
        })
      )
    );
  });
});
