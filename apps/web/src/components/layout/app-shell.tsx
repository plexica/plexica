// app-shell.tsx
// Application shell layout: skip link + sidebar + header + main content area.
// Uses CSS grid for the 2-column (sidebar + main) layout.
//
// M-07 fix: replaced window.innerWidth (one-shot, stale after resize) with
// useMediaQuery (reactive, matches header.tsx convention).
//
// M-6 fix: RouteErrorBoundary wraps only <Outlet> (route content), not the
// entire AppShell. Header and sidebar stay visible when a route component throws.
// The boundary is keyed by pathname so it automatically resets on route changes.

import { useState } from 'react';
import { Outlet, useLocation } from '@tanstack/react-router';

import { useMediaQuery } from '../../hooks/use-media-query.js';
import { RouteErrorBoundary } from '../error/route-error-boundary.js';

import { SkipLink } from './skip-link.js';
import { Sidebar } from './sidebar.js';
import { Header } from './header.js';

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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  function handleToggleSidebar(): void {
    // On mobile: toggle open/close drawer
    // On desktop: toggle collapsed/expanded
    if (!isDesktop) {
      setSidebarOpen((prev) => !prev);
    } else {
      setSidebarCollapsed((prev) => !prev);
    }
  }

  return (
    <div className="flex min-h-screen bg-neutral-50">
      {/* Skip to content — must be first focusable element */}
      <SkipLink />

      {/* Sidebar */}
      <Sidebar
        isOpen={sidebarOpen}
        isCollapsed={sidebarCollapsed}
        onToggle={() => setSidebarOpen(false)}
      />

      {/* Main area: header + content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          isSidebarOpen={sidebarOpen}
          isSidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={handleToggleSidebar}
        />

        <main id="main-content" className="min-h-0 flex-1 overflow-auto" tabIndex={-1}>
          {/* KeyedErrorBoundary resets on route change (key = pathname) */}
          <KeyedErrorBoundary />
        </main>
      </div>
    </div>
  );
}
