// apps/web/src/__tests__/auth/AuthErrorPage.test.tsx
//
// Tests for AuthErrorPage (Spec 002, T7-12).
// Covers: all 3 variants (not-found, suspended, keycloak-error),
//         slug display, tenant logo, retry button, ARIA.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AuthErrorPage } from '@/components/auth/AuthErrorPage';

describe('AuthErrorPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // role="alert"
  // ---------------------------------------------------------------------------
  it('should render a role="alert" container', () => {
    render(<AuthErrorPage variant="not-found" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('should set aria-label on the alert to the variant heading', () => {
    render(<AuthErrorPage variant="not-found" />);
    expect(screen.getByRole('alert')).toHaveAttribute('aria-label', 'Tenant not found');
  });

  // ---------------------------------------------------------------------------
  // not-found variant
  // ---------------------------------------------------------------------------
  describe('variant: not-found', () => {
    it('should render "Tenant not found" heading', () => {
      render(<AuthErrorPage variant="not-found" />);
      expect(screen.getByRole('heading', { name: /tenant not found/i })).toBeInTheDocument();
    });

    it('should render slug in description when slug is provided', () => {
      render(<AuthErrorPage variant="not-found" slug="acme-corp" />);
      expect(screen.getByText(/no workspace was found for "acme-corp"/i)).toBeInTheDocument();
    });

    it('should render generic description when no slug is provided', () => {
      render(<AuthErrorPage variant="not-found" />);
      expect(screen.getByText(/no workspace was found for this url/i)).toBeInTheDocument();
    });

    it('should display slug in a code element when slug is provided', () => {
      render(<AuthErrorPage variant="not-found" slug="acme-corp" />);
      // The slug appears in a <code> block under "Requested workspace:"
      const codeEl = screen.getByText('acme-corp', { selector: 'code' });
      expect(codeEl).toBeInTheDocument();
    });

    it('should NOT show the slug code block when no slug is provided', () => {
      render(<AuthErrorPage variant="not-found" />);
      expect(screen.queryByText('Requested workspace:')).not.toBeInTheDocument();
    });

    it('should NOT show retry button for not-found variant (showRetry false by default)', () => {
      render(<AuthErrorPage variant="not-found" />);
      expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // suspended variant
  // ---------------------------------------------------------------------------
  describe('variant: suspended', () => {
    it('should render "Account suspended" heading', () => {
      render(<AuthErrorPage variant="suspended" />);
      expect(screen.getByRole('heading', { name: /account suspended/i })).toBeInTheDocument();
    });

    it('should render suspension description', () => {
      render(<AuthErrorPage variant="suspended" />);
      expect(screen.getByText(/this workspace has been suspended/i)).toBeInTheDocument();
    });

    it('should set aria-label to "Account suspended"', () => {
      render(<AuthErrorPage variant="suspended" />);
      expect(screen.getByRole('alert')).toHaveAttribute('aria-label', 'Account suspended');
    });
  });

  // ---------------------------------------------------------------------------
  // keycloak-error variant
  // ---------------------------------------------------------------------------
  describe('variant: keycloak-error', () => {
    it('should render "Authentication service unavailable" heading', () => {
      render(<AuthErrorPage variant="keycloak-error" />);
      expect(
        screen.getByRole('heading', { name: /authentication service unavailable/i })
      ).toBeInTheDocument();
    });

    it('should render the temporary outage description', () => {
      render(<AuthErrorPage variant="keycloak-error" />);
      expect(screen.getByText(/could not reach the authentication service/i)).toBeInTheDocument();
    });

    it('should NOT render retry button when showRetry=false (default)', () => {
      render(<AuthErrorPage variant="keycloak-error" onRetry={vi.fn()} />);
      expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
    });

    it('should render retry button when showRetry=true and onRetry is provided', () => {
      render(<AuthErrorPage variant="keycloak-error" showRetry={true} onRetry={vi.fn()} />);
      const btn = screen.getByRole('button', { name: /retry connection/i });
      expect(btn).toBeInTheDocument();
    });

    it('should call onRetry when retry button is clicked', () => {
      const onRetry = vi.fn();
      render(<AuthErrorPage variant="keycloak-error" showRetry={true} onRetry={onRetry} />);
      fireEvent.click(screen.getByRole('button', { name: /retry connection/i }));
      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('should NOT render retry button when showRetry=true but onRetry is missing', () => {
      render(<AuthErrorPage variant="keycloak-error" showRetry={true} />);
      expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Tenant logo
  // ---------------------------------------------------------------------------
  describe('tenant logo', () => {
    it('should NOT render logo when tenantLogoUrl is not provided', () => {
      render(<AuthErrorPage variant="not-found" />);
      expect(screen.queryByAltText('Workspace logo')).not.toBeInTheDocument();
    });

    it('should NOT render logo when tenantLogoUrl is null', () => {
      render(<AuthErrorPage variant="not-found" tenantLogoUrl={null} />);
      expect(screen.queryByAltText('Workspace logo')).not.toBeInTheDocument();
    });

    it('should render logo img when tenantLogoUrl is provided', () => {
      render(<AuthErrorPage variant="not-found" tenantLogoUrl="https://example.com/logo.png" />);
      const img = screen.getByAltText('Workspace logo') as HTMLImageElement;
      expect(img).toBeInTheDocument();
      expect(img.src).toBe('https://example.com/logo.png');
    });
  });
});
