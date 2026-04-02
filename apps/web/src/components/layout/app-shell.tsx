// app-shell.tsx
// Application shell layout: skip link + sidebar + header + main content area.
// Uses CSS grid for the 2-column (sidebar + main) layout.
//
// M-07 fix: replaced window.innerWidth (one-shot, stale after resize) with
// useMediaQuery (reactive, matches header.tsx convention).

import { useState } from 'react';
import { Outlet } from '@tanstack/react-router';

import { useMediaQuery } from '../../hooks/use-media-query.js';

import { SkipLink } from './skip-link.js';
import { Sidebar } from './sidebar.js';
import { Header } from './header.js';

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
          <Outlet />
        </main>
      </div>
    </div>
  );
}
