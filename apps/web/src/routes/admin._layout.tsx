// File: apps/web/src/routes/admin._layout.tsx
//
// Tenant Admin layout shell for apps/web (Spec 008 T008-39).
// All routes nested under admin.* inherit this shell:
//   - auth guard via useRequireTenantAdmin()
//   - AdminSidebarNav with Tenant Admin nav items
//   - responsive header with hamburger toggle at ≤768px
//   - sidebar state persisted in localStorage
//
// TanStack Router: the filename uses "." separators for nested route grouping.
// Routes at admin.users.tsx, admin.teams.tsx, etc. share this layout.

import { Suspense, useCallback, useEffect, useState } from 'react';
import { createFileRoute, Outlet, useNavigate } from '@tanstack/react-router';
import {
  LayoutDashboard,
  Users,
  Users2,
  ShieldCheck,
  Puzzle,
  Settings,
  ScrollText,
  Menu,
} from 'lucide-react';
import { toast } from 'sonner';
import { useRequireTenantAdmin } from '@/hooks/useAdminAuth';

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------
export const Route = createFileRoute('/admin' as never)({
  component: TenantAdminLayout,
});

// ---------------------------------------------------------------------------
// Nav items for the Tenant Admin portal
// ---------------------------------------------------------------------------
const TENANT_ADMIN_NAV_ITEMS = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/admin/dashboard' },
  { label: 'Users', icon: Users, path: '/admin/users' },
  { label: 'Teams', icon: Users2, path: '/admin/teams' },
  { label: 'Roles', icon: ShieldCheck, path: '/admin/roles' },
  { label: 'Plugin Settings', icon: Puzzle, path: '/admin/plugins' },
  { label: 'Settings', icon: Settings, path: '/admin/settings' },
  { label: 'Audit Log', icon: ScrollText, path: '/admin/audit-log' },
];

// localStorage key for sidebar collapsed state
const SIDEBAR_STORAGE_KEY = 'tenant-admin-sidebar-collapsed';

// ---------------------------------------------------------------------------
// AdminSkeleton — shown while route-level Suspense boundaries resolve
// ---------------------------------------------------------------------------
function AdminSkeleton() {
  return (
    <div className="flex-1 p-6 space-y-4" aria-busy="true" aria-label="Loading page…">
      <div className="h-8 w-64 rounded bg-muted animate-pulse" />
      <div className="h-4 w-48 rounded bg-muted animate-pulse" />
      <div className="grid grid-cols-3 gap-4 mt-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Layout component
// ---------------------------------------------------------------------------
function TenantAdminLayout() {
  const isAdmin = useRequireTenantAdmin();
  const navigate = useNavigate();

  // Restore sidebar collapsed state from localStorage
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  // Persist sidebar state
  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarCollapsed));
    } catch {
      // localStorage unavailable — silently ignore
    }
  }, [sidebarCollapsed]);

  const handleToggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => !prev);
  }, []);

  // Feature-flag gate: if admin_interfaces_enabled is explicitly false, block access.
  useEffect(() => {
    const flagValue = import.meta.env.VITE_ENABLE_ADMIN_INTERFACES;
    if (flagValue === 'false') {
      toast.error('Admin interfaces are currently disabled. Contact your platform administrator.');
      void navigate({ to: '/' as never });
    }
  }, [navigate]);

  // While auth is loading, useRequireTenantAdmin returns false
  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Skip-nav */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-2 focus:bg-background focus:border focus:border-border focus:rounded focus:text-foreground focus:text-sm"
      >
        Skip to main content
      </a>

      {/* Header */}
      <header
        className="h-16 flex items-center px-4 border-b bg-[var(--admin-header-bg,hsl(var(--background)))] z-30"
        role="banner"
      >
        {/* Hamburger — visible only on mobile (≤1024px) */}
        <button
          type="button"
          aria-label="Toggle navigation menu"
          aria-expanded={!sidebarCollapsed}
          aria-controls="tenant-admin-sidebar"
          onClick={handleToggleSidebar}
          className="lg:hidden mr-3 rounded p-1.5 hover:bg-muted transition-colors"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>

        <span className="font-semibold text-foreground text-sm tracking-wide">Plexica Admin</span>
      </header>

      {/* Body — sidebar + main */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div id="tenant-admin-sidebar">
          <nav
            aria-label="Tenant Admin navigation"
            className={[
              'h-full border-r bg-[var(--admin-header-bg,hsl(var(--background)))] transition-all duration-200',
              // Desktop: always visible, width based on collapsed state
              'hidden lg:flex lg:flex-col',
              sidebarCollapsed ? 'lg:w-16' : 'lg:w-60',
            ].join(' ')}
          >
            {/* Nav items */}
            <ul className="flex flex-col gap-1 p-2 flex-1">
              {TENANT_ADMIN_NAV_ITEMS.map((item) => (
                <li key={item.path}>
                  <a
                    href={item.path}
                    className="flex items-center gap-3 rounded px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                  >
                    <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {!sidebarCollapsed && <span>{item.label}</span>}
                  </a>
                </li>
              ))}
            </ul>

            {/* Collapse toggle (desktop only) */}
            <button
              type="button"
              onClick={handleToggleSidebar}
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="hidden lg:flex items-center justify-center h-10 border-t hover:bg-muted transition-colors text-muted-foreground"
            >
              <Menu className="h-4 w-4" aria-hidden="true" />
            </button>
          </nav>

          {/* Mobile overlay sidebar */}
          {!sidebarCollapsed && (
            <div className="lg:hidden fixed inset-0 z-40 flex">
              {/* Backdrop */}
              <div
                className="fixed inset-0 bg-black/50"
                aria-hidden="true"
                onClick={handleToggleSidebar}
              />
              {/* Drawer */}
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Navigation menu"
                className="relative z-50 w-60 bg-background border-r flex flex-col"
              >
                <nav aria-label="Tenant Admin navigation" className="flex-1">
                  <ul className="flex flex-col gap-1 p-2">
                    {TENANT_ADMIN_NAV_ITEMS.map((item) => (
                      <li key={item.path}>
                        <a
                          href={item.path}
                          className="flex items-center gap-3 rounded px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                          onClick={handleToggleSidebar}
                        >
                          <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                          <span>{item.label}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </nav>
              </div>
            </div>
          )}
        </div>

        {/* Main content area */}
        <main id="main-content" role="main" className="flex-1 overflow-auto flex flex-col">
          <div className="p-6 flex-1">
            <Suspense fallback={<AdminSkeleton />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}
