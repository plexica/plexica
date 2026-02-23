// apps/web/src/__tests__/auth/SessionExpiredModal.test.tsx
//
// Tests for SessionExpiredModal (Spec 002, T7-12).
// Verifies: render, focus management, focus trap, Esc suppression, sign-in handler.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SessionExpiredModal } from '@/components/auth/SessionExpiredModal';

// Mock dependencies
const mockSaveDeepLink = vi.fn();

vi.mock('@/stores/auth.store', () => ({
  useAuthStore: vi.fn(() => ({
    saveDeepLink: mockSaveDeepLink,
  })),
}));

vi.mock('@/lib/tenant', () => ({
  getTenantFromUrl: vi.fn(() => 'acme-corp'),
}));

// Suppress window.location.href assignment (jsdom doesn't support navigation)
const mockHref = vi.fn();
Object.defineProperty(window, 'location', {
  value: {
    get href() {
      return '';
    },
    set href(v: string) {
      mockHref(v);
    },
  },
  writable: true,
  configurable: true,
});

describe('SessionExpiredModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render nothing when isOpen=false', () => {
    const { container } = render(<SessionExpiredModal isOpen={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('should render dialog with correct ARIA attributes when open', () => {
    render(<SessionExpiredModal isOpen={true} />);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'session-expired-title');
    expect(dialog).toHaveAttribute('aria-describedby', 'session-expired-desc');
  });

  it('should display "Session expired" heading', () => {
    render(<SessionExpiredModal isOpen={true} />);
    expect(screen.getByText('Session expired')).toBeInTheDocument();
  });

  it('should display description text', () => {
    render(<SessionExpiredModal isOpen={true} />);
    expect(screen.getByText(/your session has expired/i)).toBeInTheDocument();
  });

  it('should render "Sign in again" button', () => {
    render(<SessionExpiredModal isOpen={true} />);
    const btn = screen.getByRole('button', { name: /sign in again/i });
    expect(btn).toBeInTheDocument();
  });

  it('should focus the Sign In button after a short delay', async () => {
    render(<SessionExpiredModal isOpen={true} />);
    const btn = screen.getByRole('button', { name: /sign in again/i });
    await waitFor(
      () => {
        expect(document.activeElement).toBe(btn);
      },
      { timeout: 200 }
    );
  });

  it('should navigate to login when Sign In is clicked', () => {
    render(<SessionExpiredModal isOpen={true} />);
    const btn = screen.getByRole('button', { name: /sign in again/i });
    fireEvent.click(btn);
    expect(mockHref).toHaveBeenCalledWith('/acme-corp/login');
  });

  it('should prevent Escape from closing the dialog', () => {
    render(<SessionExpiredModal isOpen={true} />);
    const dialog = screen.getByRole('dialog');
    // Dialog should still be present after Escape
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(dialog).toBeInTheDocument();
  });

  it('should trap Tab key within the modal', () => {
    render(<SessionExpiredModal isOpen={true} />);
    const btn = screen.getByRole('button', { name: /sign in again/i });
    const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true });
    const preventDefaultSpy = vi.spyOn(tabEvent, 'preventDefault');
    document.dispatchEvent(tabEvent);
    expect(preventDefaultSpy).toHaveBeenCalled();
    // Focus should be on the sign-in button
    expect(document.activeElement).toBe(btn);
  });
});
