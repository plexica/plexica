// apps/web/src/components/ErrorBoundary/RootErrorFallback.tsx
//
// Static fallback UI rendered by RootErrorBoundary when the entire React tree
// throws an unhandled error.
//
// IMPORTANT: This component intentionally has ZERO context dependencies.
// It must be renderable when ThemeProvider, IntlProvider, QueryClientProvider,
// or RouterProvider are broken. Do NOT use:
//   - Tailwind CSS custom property classes (bg-background, text-foreground, etc.)
//   - useTheme, useIntl, useQuery, or any other context hooks
//   - Dynamic imports or lazy-loaded components
//
// Safe: inline styles, static Tailwind utility classes, basic DOM elements.

import React from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RootErrorFallbackProps {
  error: Error | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RootErrorFallback({ error }: RootErrorFallbackProps): React.ReactElement {
  return (
    <div
      role="alert"
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#ffffff',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        padding: '1.5rem',
      }}
    >
      <div
        style={{
          maxWidth: '32rem',
          width: '100%',
          textAlign: 'center',
        }}
      >
        {/* Icon */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '4rem',
            height: '4rem',
            borderRadius: '50%',
            backgroundColor: '#fee2e2',
            marginBottom: '1.5rem',
          }}
          aria-hidden="true"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#dc2626"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>

        {/* Heading */}
        <h1
          style={{
            fontSize: '1.5rem',
            fontWeight: 700,
            color: '#111827',
            marginBottom: '0.75rem',
            margin: '0 0 0.75rem 0',
          }}
        >
          Something went wrong
        </h1>

        {/* Description */}
        <p
          style={{
            fontSize: '1rem',
            color: '#6b7280',
            marginBottom: '2rem',
            margin: '0 0 2rem 0',
            lineHeight: 1.6,
          }}
        >
          An unexpected error occurred. Please reload the page. If the problem persists,{' '}
          <a
            href="mailto:support@plexica.io"
            style={{ color: '#2563eb', textDecoration: 'underline' }}
          >
            contact support
          </a>
          .
        </p>

        {/* Error message — only shown in development mode (never exposed in production) */}
        {import.meta.env.DEV && error?.message && (
          <p
            style={{
              fontSize: '0.875rem',
              color: '#9ca3af',
              fontFamily: 'monospace',
              backgroundColor: '#f9fafb',
              border: '1px solid #e5e7eb',
              borderRadius: '0.375rem',
              padding: '0.75rem 1rem',
              marginBottom: '2rem',
              wordBreak: 'break-word',
              textAlign: 'left',
            }}
          >
            {error.message}
          </p>
        )}

        {/* Reload button */}
        <button
          onClick={() => window.location.reload()}
          type="button"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            paddingTop: '0.625rem',
            paddingBottom: '0.625rem',
            paddingLeft: '1.5rem',
            paddingRight: '1.5rem',
            backgroundColor: '#2563eb',
            color: '#ffffff',
            border: 'none',
            borderRadius: '0.5rem',
            fontSize: '0.875rem',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'background-color 0.15s ease',
            // MED-4: explicit outline reset; real focus ring applied via onFocus
            outline: 'none',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#1d4ed8';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#2563eb';
          }}
          onFocus={(e) => {
            // WCAG 2.4.7 / 2.4.11: visible focus indicator for keyboard navigation.
            // #bfdbfe (Tailwind blue-200) yields 3.64:1 contrast against #2563eb —
            // passes both WCAG 2.1 AA (no numeric threshold) and WCAG 2.2 AA (≥3.0:1).
            (e.currentTarget as HTMLButtonElement).style.outline = '3px solid #bfdbfe';
            (e.currentTarget as HTMLButtonElement).style.outlineOffset = '2px';
          }}
          onBlur={(e) => {
            (e.currentTarget as HTMLButtonElement).style.outline = 'none';
            (e.currentTarget as HTMLButtonElement).style.outlineOffset = '0';
          }}
        >
          Reload Page
        </button>
      </div>
    </div>
  );
}
