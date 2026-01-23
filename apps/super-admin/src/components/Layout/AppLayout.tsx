// File: apps/super-admin/src/components/Layout/AppLayout.tsx

import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

interface AppLayoutProps {
  children: React.ReactNode;
  showFooter?: boolean;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ children, showFooter = true }) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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

      {/* Footer - Optional, height 48px */}
      {showFooter && (
        <footer className="border-t bg-background h-12 flex items-center px-4">
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">Plexica Platform Administration</span>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-4">
            <a
              href="/docs"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Documentation
            </a>
            <a
              href="/support"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Support
            </a>
          </div>
        </footer>
      )}
    </div>
  );
};
