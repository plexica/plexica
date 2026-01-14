// File: apps/web/src/components/Layout/Sidebar.tsx

import React from 'react';
import { Link, useLocation } from '@tanstack/react-router';
import { useAuthStore } from '@/stores/auth-store';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

interface MenuItem {
  label: string;
  path: string;
  icon: string;
}

const coreMenuItems: MenuItem[] = [
  { label: 'Dashboard', path: '/', icon: '📊' },
  { label: 'My Plugins', path: '/plugins', icon: '🧩' },
  { label: 'Team', path: '/team', icon: '👥' },
  { label: 'Settings', path: '/settings', icon: '⚙️' },
];

export const Sidebar: React.FC<SidebarProps> = ({ isOpen }) => {
  const location = useLocation();
  const { tenant } = useAuthStore();

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  return (
    <aside
      className={`bg-card border-r border-border transition-all duration-300 ${
        isOpen ? 'w-64' : 'w-20'
      }`}
    >
      {/* Logo */}
      <div className="h-16 flex items-center px-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-white font-bold">
            P
          </div>
          {isOpen && <span className="text-lg font-bold text-foreground">Plexica</span>}
        </div>
      </div>

      {/* Workspace Info */}
      {isOpen && tenant && (
        <div className="px-4 py-3 border-b border-border">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Workspace</p>
          <p className="text-sm font-medium text-foreground truncate">{tenant.name}</p>
        </div>
      )}

      {/* Navigation */}
      <nav className="p-2 space-y-1">
        {/* Core Menu Items */}
        <div className="py-2">
          {isOpen && (
            <p className="px-3 py-1 text-xs text-muted-foreground uppercase tracking-wide">Core</p>
          )}
          {coreMenuItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                isActive(item.path) ? 'bg-primary text-white' : 'text-foreground hover:bg-muted'
              }`}
            >
              <span className="text-xl">{item.icon}</span>
              {isOpen && <span className="text-sm font-medium">{item.label}</span>}
            </Link>
          ))}
        </div>

        {/* Plugins Section */}
        {isOpen && (
          <div className="py-2">
            <p className="px-3 py-1 text-xs text-muted-foreground uppercase tracking-wide">
              Plugins
            </p>
            <div className="px-3 py-2 text-sm text-muted-foreground">No plugins installed</div>
          </div>
        )}
      </nav>

      {/* Bottom Actions */}
      <div className="absolute bottom-0 left-0 right-0 p-2 border-t border-border bg-card">
        <a
          href="/help"
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-foreground hover:bg-muted transition-colors"
        >
          <span className="text-xl">❓</span>
          {isOpen && <span className="text-sm font-medium">Help</span>}
        </a>
      </div>
    </aside>
  );
};
