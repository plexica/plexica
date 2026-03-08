// File: apps/super-admin/src/routes/_layout.tsx
//
// Pathless layout wrapper for the Super Admin portal (Spec 008 T008-39).
// All routes nested under this layout inherit the admin shell:
//   - auth guard via useRequireSuperAdmin()
//   - AdminSidebarNav with Super Admin nav items
//   - responsive header with hamburger toggle at ≤768px
//   - sidebar state persisted in localStorage
//   - feature-flag gate: redirects to '/' when admin_interfaces_enabled = false
//
// TanStack Router: because the filename starts with '_', this route is
// "pathless" — it wraps children without adding a URL segment.

import { Suspense, useCallback, useEffect, useState } from 'react';
import { createFileRoute, Outlet, useNavigate } from '@tanstack/react-router';
import {
  LayoutDashboard,
  Building2,
  Puzzle,
  Users,
  Settings2,
  ScrollText,
  Activity,
  Menu,
} from 'lucide-react';
import { toast } from 'sonner';
import { AdminSidebarNav } from '@/components/AdminSidebarNav';
import { useRequireSuperAdmin } from '@/hooks/useAdminAuth';
import { useActiveAlertsCount } from '@/hooks/useObservability';

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------
export const Route = createFileRoute('/_layout' as never)({
  component: SuperAdminLayout,
});

// ---------------------------------------------------------------------------
// Static nav items (no badge)
// The Observability item is built dynamically inside the component so it can
// carry the live active-alerts badge count from useActiveAlertsCount().
// ---------------------------------------------------------------------------
const STATIC_NAV_ITEMS = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
  { label: 'Tenants', icon: Building2, path: '/tenants' },
  { label: 'Plugins', icon: Puzzle, path: '/plugins' },
  { label: 'Users', icon: Users, path: '/users' },
  { label: 'System Config', icon: Settings2, path: '/system-config' },
  { label: 'Audit Log', icon: ScrollText, path: '/audit-log' },
  { label: 'Health', icon: Activity, path: '/health' },
];

// localStorage key for sidebar collapsed state
const SIDEBAR_STORAGE_KEY = 'super-admin-sidebar-collapsed';

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
function SuperAdminLayout() {
  const user = useRequireSuperAdmin();
  const navigate = useNavigate();

  // Live alert count for the Observability sidebar badge
  const activeAlertsCount = useActiveAlertsCount();

  // Build nav items with the live badge on the Observability entry.
  // Observability item is hidden when feature flag is disabled (T012-47).
  const observabilityEnabled = import.meta.env.VITE_ENABLE_OBSERVABILITY_DASHBOARD !== 'false';

  const navItems = [
    ...STATIC_NAV_ITEMS,
    ...(observabilityEnabled
      ? [
          {
            label: 'Observability',
            icon: Activity,
            path: '/observability',
            badge: activeAlertsCount > 0 ? activeAlertsCount : undefined,
          },
        ]
      : []),
  ];

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
  // The flag is read from env (VITE_ENABLE_ADMIN_INTERFACES). Defaults to true for
  // the super-admin app (the app itself IS the admin interface).
  useEffect(() => {
    const flagValue = import.meta.env.VITE_ENABLE_ADMIN_INTERFACES;
    if (flagValue === 'false') {
      toast.error('Admin interfaces are currently disabled. Contact your platform administrator.');
      void navigate({ to: '/' as never });
    }
  }, [navigate]);

  // While auth is loading, useRequireSuperAdmin returns null
  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Skip-nav — rendered once at page level (also inside nav for nested focus order) */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-2 focus:bg-background focus:border focus:border-border focus:rounded focus:text-foreground focus:text-sm"
      >
        Skip to main content
      </a>

      {/* Header — background uses CSS token for theming */}
      <header
        className="h-16 flex items-center px-4 border-b bg-[var(--admin-header-bg,hsl(var(--background)))] z-30"
        role="banner"
      >
        {/* Hamburger — visible only on mobile (≤1024px) */}
        <button
          type="button"
          aria-label="Toggle navigation menu"
          aria-expanded={!sidebarCollapsed}
          aria-controls="super-admin-sidebar"
          onClick={handleToggleSidebar}
          className="lg:hidden mr-3 rounded p-1.5 hover:bg-muted transition-colors"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>

        <span className="font-semibold text-foreground text-sm tracking-wide">
          Plexica Super Admin
        </span>
      </header>

      {/* Body — sidebar + main */}
      <div className="flex flex-1 overflow-hidden">
        <div id="super-admin-sidebar">
          <AdminSidebarNav
            navItems={navItems}
            collapsed={sidebarCollapsed}
            onToggle={handleToggleSidebar}
            portalLabel="Super Admin navigation"
          />
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
