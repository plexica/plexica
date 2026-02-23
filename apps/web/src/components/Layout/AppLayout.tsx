// File: apps/web/src/components/Layout/AppLayout.tsx

import React, { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { SessionExpiredModal } from '@/components/auth/SessionExpiredModal';

interface AppLayoutProps {
  children: React.ReactNode;
  showFooter?: boolean;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ children, showFooter = true }) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  // Listen for the global session-expired event dispatched by auth.store.ts
  useEffect(() => {
    const handler = () => setSessionExpired(true);
    window.addEventListener('plexica:session-expired', handler);
    return () => window.removeEventListener('plexica:session-expired', handler);
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header - Fixed at top, height 64px */}
      <Header onMenuClick={() => setSidebarCollapsed(!sidebarCollapsed)} />

      {/* Main Container - Sidebar + Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar - Width: 240px (expanded) / 64px (collapsed) */}
        <Sidebar collapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} />

        {/* Main Content Area */}
        <main className="flex-1 overflow-auto">
          <div className="p-6">{children}</div>
        </main>
      </div>

      {/* Footer - Optional, height 48px as per UX specs */}
      {showFooter && (
        <footer className="border-t bg-background h-12 flex items-center px-4">
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
