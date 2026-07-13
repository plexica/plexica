// app-shell.tsx
// Admin application shell layout: sidebar + header + main content area.
// Standalone — no Module Federation host role (plan D-2).

import { useState } from 'react';
import { Outlet } from '@tanstack/react-router';

import { AdminSidebar } from './sidebar.js';
import { AdminHeader } from './header.js';

export function AppShell(): JSX.Element {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-neutral-50">
      <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminHeader onToggleSidebar={() => setSidebarOpen((prev) => !prev)} />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
