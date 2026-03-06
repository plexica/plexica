// apps/web/src/__tests__/error-boundary/RootErrorBoundary.test.tsx
//
// Unit tests for RootErrorBoundary and RootErrorFallback
//
// Spec 010 FR-016: Shell-level error boundary catches unhandled errors
// Spec 010 FR-017: Structured Pino error logging (ADR-021)
// Spec 010 FR-018: Component stack capture
//
// Coverage targets:
//   - Children render normally when no error occurs               ✓
//   - Fallback shown when child throws during render              ✓
//   - logger.error called with structured fields on catch         ✓
//   - Component stack captured in log entry                       ✓
//   - Error message displayed in fallback                         ✓
//   - Reload Page button calls window.location.reload()           ✓
//   - logging failure does not re-throw (try/catch in boundary)   ✓

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mock Pino logger before importing the component (vi.mock is hoisted)
// ---------------------------------------------------------------------------

const { mockLoggerError } = vi.hoisted(() => ({
  mockLoggerError: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    error: mockLoggerError,
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
  createContextLogger: vi.fn(() => ({ error: mockLoggerError })),
}));

// ---------------------------------------------------------------------------
// Import components after mocks
// ---------------------------------------------------------------------------

import { RootErrorBoundary } from '@/components/ErrorBoundary/RootErrorBoundary';
import { RootErrorFallback } from '@/components/ErrorBoundary/RootErrorFallback';

// ---------------------------------------------------------------------------
// Suppress React's expected console.error noise during error boundary tests
// ---------------------------------------------------------------------------

const originalConsoleError = console.error;
beforeAll(() => {
  console.error = vi.fn();
});
afterAll(() => {
  console.error = originalConsoleError;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ThrowOnRender({ message }: { message: string }): any {
  throw new Error(message);
}

// ---------------------------------------------------------------------------
// Tests: RootErrorBoundary
// ---------------------------------------------------------------------------

describe('RootErrorBoundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  let originalLocation: Location | undefined;
  afterEach(() => {
    if (originalLocation !== undefined) {
      Object.defineProperty(window, 'location', {
        value: originalLocation,
        writable: true,
      });
      originalLocation = undefined;
    }
  });

  it('renders children when no error occurs', () => {
    render(
      <RootErrorBoundary>
        <div data-testid="app">healthy app</div>
      </RootErrorBoundary>
    );
    expect(screen.getByTestId('app')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });

  it('shows fallback when child throws during render', () => {
    render(
      <RootErrorBoundary>
        <ThrowOnRender message="app-crash" />
      </RootErrorBoundary>
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText(/Reload Page/)).toBeInTheDocument();
  });

  it('displays the error message in the fallback (DEV mode only)', () => {
    // import.meta.env.DEV is true in Vitest (development mode), so the error
    // message box is rendered. In production builds DEV=false and the message
    // is hidden to prevent leaking internals to end users (R-01).
    render(
      <RootErrorBoundary>
        <ThrowOnRender message="specific-error-message-xyz" />
      </RootErrorBoundary>
    );
    expect(screen.getByText(/specific-error-message-xyz/)).toBeInTheDocument();
  });

  it('calls logger.error with structured fields including err and componentStack', () => {
    render(
      <RootErrorBoundary>
        <ThrowOnRender message="structured-log-test" />
      </RootErrorBoundary>
    );

    expect(mockLoggerError).toHaveBeenCalledOnce();
    const [logObj, logMsg] = mockLoggerError.mock.calls[0] as [
      { err: { message: string }; componentStack: string; timestamp: string },
      string,
    ];
    expect(logObj.err.message).toBe('structured-log-test');
    expect(logObj.componentStack).toBeDefined();
    expect(logObj.timestamp).toBeDefined();
    expect(logMsg).toContain('[RootErrorBoundary]');
  });

  it('does not crash when logger.error itself throws', () => {
    mockLoggerError.mockImplementationOnce(() => {
      throw new Error('logger broken');
    });

    // Should not re-throw — the try/catch in componentDidCatch swallows logger errors
    expect(() =>
      render(
        <RootErrorBoundary>
          <ThrowOnRender message="logger-fail-test" />
        </RootErrorBoundary>
      )
    ).not.toThrow();

    // Fallback should still be shown
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('calls window.location.reload() when Reload Page button is clicked', () => {
    originalLocation = window.location;
    const reloadMock = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: reloadMock },
      writable: true,
    });

    render(
      <RootErrorBoundary>
        <ThrowOnRender message="reload-test" />
      </RootErrorBoundary>
    );

    fireEvent.click(screen.getByText('Reload Page'));
    expect(reloadMock).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Tests: RootErrorFallback (standalone)
// ---------------------------------------------------------------------------

describe('RootErrorFallback', () => {
  it('renders "Something went wrong" heading', () => {
    render(<RootErrorFallback error={null} />);
    expect(screen.getByRole('heading', { name: /something went wrong/i })).toBeInTheDocument();
  });

  it('renders the error message when error is provided (DEV mode only)', () => {
    // In DEV mode (import.meta.env.DEV=true), the error message is shown.
    // In production builds the message box is hidden (R-01).
    render(<RootErrorFallback error={new Error('boom')} />);
    expect(screen.getByText('boom')).toBeInTheDocument();
  });

  it('does not render error message paragraph when error is null', () => {
    render(<RootErrorFallback error={null} />);
    // No monospace error box — the paragraph with the error message should not be present
    expect(screen.queryByText('boom')).not.toBeInTheDocument();
  });

  it('renders Reload Page button', () => {
    render(<RootErrorFallback error={null} />);
    expect(screen.getByRole('button', { name: /reload page/i })).toBeInTheDocument();
  });

  it('has role="alert" on the root container for accessibility', () => {
    render(<RootErrorFallback error={null} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
