// apps/web/src/__tests__/auth/AuthWarningBanner.test.tsx
//
// Unit tests for AuthWarningBanner (T005-17).
// Verifies: flag-gating, visibility on refreshFailed state, dismiss action,
// refresh action, and ARIA attributes.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AuthWarningBanner } from '@/components/AuthWarningBanner';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSetRefreshFailed = vi.fn();
const mockRefreshTokens = vi.fn().mockResolvedValue(true);

let mockRefreshFailed = false;
let mockFlagEnabled = true;

vi.mock('@/stores/auth.store', () => ({
  useAuthStore: vi.fn((selector: (s: object) => unknown) =>
    selector({
      refreshFailed: mockRefreshFailed,
      setRefreshFailed: mockSetRefreshFailed,
      refreshTokens: mockRefreshTokens,
    })
  ),
}));

vi.mock('@/lib/feature-flags', () => ({
  useFeatureFlag: vi.fn(() => mockFlagEnabled),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderBanner() {
  return render(<AuthWarningBanner />);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AuthWarningBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRefreshFailed = false;
    mockFlagEnabled = true;
  });

  describe('when ENABLE_AUTH_WARNING_BANNER flag is disabled', () => {
    it('should render nothing regardless of refreshFailed state', () => {
      mockFlagEnabled = false;
      mockRefreshFailed = true;
      const { container } = renderBanner();
      expect(container.firstChild).toBeNull();
    });
  });

  describe('when flag is enabled but refreshFailed is false', () => {
    it('should render nothing', () => {
      mockRefreshFailed = false;
      const { container } = renderBanner();
      expect(container.firstChild).toBeNull();
    });
  });

  describe('when flag is enabled and refreshFailed is true', () => {
    beforeEach(() => {
      mockRefreshFailed = true;
    });

    it('should render the warning banner', () => {
      renderBanner();
      expect(screen.getByTestId('auth-warning-banner')).toBeInTheDocument();
    });

    it('should display the session expiry warning message', () => {
      renderBanner();
      expect(screen.getByText(/your session may have expired/i)).toBeInTheDocument();
    });

    it('should have role="alert" for screen reader announcement', () => {
      renderBanner();
      const banner = screen.getByRole('alert');
      expect(banner).toBeInTheDocument();
      expect(banner).toHaveAttribute('aria-live', 'assertive');
    });

    it('should render Refresh and Dismiss buttons', () => {
      renderBanner();
      expect(screen.getByTestId('auth-warning-refresh-btn')).toBeInTheDocument();
      expect(screen.getByTestId('auth-warning-dismiss-btn')).toBeInTheDocument();
    });

    it('should call setRefreshFailed(false) when Dismiss is clicked', () => {
      renderBanner();
      fireEvent.click(screen.getByTestId('auth-warning-dismiss-btn'));
      expect(mockSetRefreshFailed).toHaveBeenCalledWith(false);
    });

    it('should call refreshTokens() when Refresh is clicked', () => {
      renderBanner();
      fireEvent.click(screen.getByTestId('auth-warning-refresh-btn'));
      expect(mockRefreshTokens).toHaveBeenCalled();
    });

    it('should have accessible label on the Dismiss button', () => {
      renderBanner();
      const dismissBtn = screen.getByTestId('auth-warning-dismiss-btn');
      expect(dismissBtn).toHaveAttribute('aria-label', 'Dismiss session warning');
    });
  });
});
