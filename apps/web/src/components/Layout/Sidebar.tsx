// File: apps/web/src/components/Layout/Sidebar.tsx

import React from 'react';
import { Link, useLocation } from '@tanstack/react-router';
import {
  LayoutDashboard,
  Puzzle,
  Users,
  Settings,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { usePlugins } from '../../contexts/PluginContext';
import * as LucideIcons from 'lucide-react';

interface SidebarProps {
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
}

interface MenuItem {
  label: string;
  path: string;
  icon: React.ReactNode;
}

const coreMenuItems: MenuItem[] = [
  { label: 'Dashboard', path: '/', icon: <LayoutDashboard className="w-5 h-5" /> },
  { label: 'My Plugins', path: '/plugins', icon: <Puzzle className="w-5 h-5" /> },
  { label: 'Team', path: '/team', icon: <Users className="w-5 h-5" /> },
  { label: 'Settings', path: '/settings', icon: <Settings className="w-5 h-5" /> },
];

export const Sidebar: React.FC<SidebarProps> = ({ collapsed, onCollapsedChange }) => {
  const location = useLocation();
  const { menuItems, isLoading } = usePlugins();

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  // Helper to get icon component from string name
  const getIcon = (iconName?: string) => {
    if (!iconName) return <Puzzle className="w-5 h-5" />;

    const IconComponent = (LucideIcons as any)[iconName];
    if (IconComponent) {
      return <IconComponent className="w-5 h-5" />;
    }
    return <Puzzle className="w-5 h-5" />;
  };

  return (
    <aside
      className={`border-r bg-background transition-all duration-300 flex flex-col ${
        collapsed ? 'w-16' : 'w-60'
      }`}
    >
      {/* Navigation Content */}
      <div className="flex-1 overflow-y-auto py-4">
        {/* Core Section */}
        <div className="px-3 py-2">
          {!collapsed && (
            <h3 className="mb-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              CORE
            </h3>
          )}
          {coreMenuItems.map((item) => (
            <Link key={item.path} to={item.path}>
              <div
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors cursor-pointer ${
                  collapsed ? 'justify-center px-2' : ''
                } ${
                  isActive(item.path)
                    ? 'bg-muted text-foreground border-l-4 border-l-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <span className="flex-shrink-0">{item.icon}</span>
                {!collapsed && <span className="flex-1">{item.label}</span>}
              </div>
            </Link>
          ))}
        </div>

        <hr className="my-2 border-t border-border" />

        {/* Applications Section */}
        <div className="px-3 py-2">
          {!collapsed && (
            <h3 className="mb-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              APPLICATIONS
            </h3>
          )}
          {isLoading && !collapsed && (
            <div className="px-3 py-2 text-sm text-muted-foreground">Loading plugins...</div>
          )}
          {!isLoading && menuItems.length === 0 && !collapsed && (
            <div className="px-3 py-2 text-sm text-muted-foreground">No plugins installed</div>
          )}
          {!isLoading &&
            menuItems.map((item) => (
              <Link key={item.id} to={item.path || '#'}>
                <div
                  className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors cursor-pointer ${
                    collapsed ? 'justify-center px-2' : ''
                  } ${
                    isActive(item.path || '')
                      ? 'bg-muted text-foreground border-l-4 border-l-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <span className="flex-shrink-0">{getIcon(item.icon)}</span>
                  {!collapsed && <span className="flex-1">{item.label}</span>}
                  {!collapsed && item.badge && (
                    <span className="px-2 py-0.5 text-xs rounded-full bg-primary text-primary-foreground">
                      {item.badge}
                    </span>
                  )}
                </div>
              </Link>
            ))}
        </div>

        <hr className="my-2 border-t border-border" />

        {/* Help Section */}
        <div className="px-3 py-2">
          <a href="/help">
            <div
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer ${
                collapsed ? 'justify-center px-2' : ''
              }`}
            >
              <span className="flex-shrink-0">
                <HelpCircle className="w-5 h-5" />
              </span>
              {!collapsed && <span className="flex-1">Help & Support</span>}
            </div>
          </a>
        </div>
      </div>

      {/* Collapse Toggle Button */}
      <div className="border-t p-2">
        <button
          onClick={() => onCollapsedChange(!collapsed)}
          className="w-full flex items-center justify-center p-2 rounded hover:bg-muted transition-colors"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>
    </aside>
  );
};
