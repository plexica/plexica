// File: apps/web/src/components/Layout/AppLayout.tsx
//
// T005-24: Wired with SidebarNav (ENABLE_NEW_SIDEBAR flag), Breadcrumbs,
// ARIA landmarks (main, footer), and mobile sidebar open/close state.

import React, { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { SidebarNav } from './SidebarNav';
import { Breadcrumbs } from './Breadcrumbs';
import { Header } from './Header';
import { SessionExpiredModal } from '@/components/auth/SessionExpiredModal';
import { AuthWarningBanner } from '@/components/AuthWarningBanner';
import { useFeatureFlag } from '@/lib/feature-flags';

interface AppLayoutProps {
  children: React.ReactNode;
  showFooter?: boolean;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ children, showFooter = true }) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  const useNewSidebar = useFeatureFlag('ENABLE_NEW_SIDEBAR');

  // Listen for the global session-expired event dispatched by auth.store.ts
  useEffect(() => {
    const handler = () => setSessionExpired(true);
    window.addEventListener('plexica:session-expired', handler);
    return () => window.removeEventListener('plexica:session-expired', handler);
  }, []);

  const handleMenuClick = () => {
    if (useNewSidebar) {
      setIsSidebarOpen((prev) => !prev);
    } else {
      setSidebarCollapsed((prev) => !prev);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header — Fixed at top, height 64px */}
      <Header onMenuClick={handleMenuClick} />

      {/* Auth warning banner — shown below header when token refresh fails */}
      <AuthWarningBanner />

      {/* Main Container — Sidebar + Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        {useNewSidebar ? (
          <SidebarNav
            isOpen={isSidebarOpen}
            onClose={() => setIsSidebarOpen(false)}
            collapsed={sidebarCollapsed}
            onCollapsedChange={setSidebarCollapsed}
          />
        ) : (
          <Sidebar collapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} />
        )}

        {/* Main Content Area */}
        <main id="main-content" role="main" className="flex-1 overflow-auto flex flex-col">
          {/* Breadcrumbs — rendered above page content */}
          {useNewSidebar && <Breadcrumbs />}

          <div className="p-6 flex-1">{children}</div>
        </main>
      </div>

      {/* Footer — Optional, height 48px */}
      {showFooter && (
        <footer role="contentinfo" className="border-t bg-background h-12 flex items-center px-4">
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">Status: All systems operational</span>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-4">
            <a href="/privacy" className="text-sm text-muted-foreground hover:text-foreground">
              Privacy
            </a>
            <a href="/support" className="text-sm text-muted-foreground hover:text-foreground">
              Support
            </a>
          </div>
        </footer>
      )}

      {/* Session Expired Modal — rendered at root so it overlays everything */}
      <SessionExpiredModal isOpen={sessionExpired} />
    </div>
  );
};
