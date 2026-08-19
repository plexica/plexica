// app-shell.tsx
// Admin application shell layout: sidebar + header + main content area.
// Standalone — no Module Federation host role (plan D-2).
//
// Decision 7 (2026-08-18): SkipLink, RouteErrorBoundary, and useMediaQuery
// are now imported from @plexica/ui — shared with apps/web. The two AppShell
// components stay separate (different visual requirements) but share the
// accessibility primitives.

import { useState } from 'react';
import { Outlet, useLocation } from '@tanstack/react-router';
import { SkipLink, RouteErrorBoundary } from '@plexica/ui';

import { AdminSidebar } from './sidebar.js';
import { AdminHeader } from './header.js';

/**
 * Wraps RouteErrorBoundary with a key derived from the current pathname.
 * React unmounts and remounts the boundary on key change — resetting error state
 * automatically when the user navigates to a different route.
 */
function KeyedErrorBoundary(): JSX.Element {
  const location = useLocation();
  return (
    <RouteErrorBoundary key={location.pathname}>
      <Outlet />
    </RouteErrorBoundary>
  );
}

export function AppShell(): JSX.Element {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-neutral-50">
      {/* Skip to content — must be first focusable element */}
      <SkipLink skipToContentLabelId="admin.nav.skipToContent" />

      {/* Sidebar */}
      <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main area: header + content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminHeader
          isSidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
        />

        <main id="main-content" className="min-h-0 flex-1 overflow-auto p-6" tabIndex={-1}>
          {/* KeyedErrorBoundary resets on route change (key = pathname) */}
          <KeyedErrorBoundary />
        </main>
      </div>
    </div>
  );
}
