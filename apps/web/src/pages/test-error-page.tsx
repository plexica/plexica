// test-error-page.tsx
// Dev/test-only page that intentionally throws a React render error.
// Used by E2E tests to verify that RouteErrorBoundary catches component
// errors and shows the ErrorFallback without crashing the AppShell.
// This component is only registered as a route in development mode.

export function TestErrorPage(): never {
  throw new Error('Intentional render error — this page exists only to test RouteErrorBoundary');
}
