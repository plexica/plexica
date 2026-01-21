// File: apps/web/src/components/Layout/Header.tsx

import React, { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useAuth } from '../AuthProvider';
import { useAuthStore } from '@/stores/auth-store';
import { WorkspaceSwitcher } from '../WorkspaceSwitcher';
import { LogOut, Settings, Menu, Search, Bell } from 'lucide-react';

interface HeaderProps {
  onMenuClick: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onMenuClick }) => {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { user, tenant } = useAuthStore();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  const handleLogout = () => {
    logout();
  };

  // User initials for avatar (handle empty strings)
  const userInitials =
    user?.name?.trim()?.[0]?.toUpperCase() || user?.email?.trim()?.[0]?.toUpperCase() || 'U';

  return (
    <header className="h-16 bg-background border-b border-border flex items-center justify-between px-4 gap-4">
      {/* Left Section - Logo and Menu (Mobile) */}
      <div className="flex items-center gap-4">
        {/* Hamburger menu button for mobile */}
        <button
          onClick={onMenuClick}
          className="p-2 hover:bg-muted rounded-lg transition-colors md:hidden"
          aria-label="Toggle menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Logo/Brand - Extension Point: header.logo */}
        <div
          className="flex items-center gap-2 cursor-pointer"
          onClick={() => navigate({ to: '/' })}
        >
          <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center text-white font-bold">
            P
          </div>
          <span className="hidden md:block text-lg font-semibold text-foreground">
            {tenant?.name || 'Plexica'}
          </span>
        </div>
      </div>

      {/* Center Section - Global Search (Extension Point: header.search) */}
      <div className="flex-1 max-w-md hidden lg:block">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search everywhere... (⌘K)"
            className="w-full pl-10 pr-4 py-2 bg-muted border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-3">
        {/* Search icon for mobile */}
        <button
          className="p-2 hover:bg-muted rounded-lg transition-colors lg:hidden"
          aria-label="Search"
        >
          <Search className="w-5 h-5" />
        </button>

        {/* Notifications Bell (Extension Point: header.notifications) */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="p-2 hover:bg-muted rounded-lg transition-colors relative"
            aria-label="Notifications"
          >
            <Bell className="w-5 h-5" />
            {/* Badge with unread count */}
            <span className="absolute top-1 right-1 w-4 h-4 bg-primary text-white text-xs rounded-full flex items-center justify-center">
              3
            </span>
          </button>

          {/* Notifications Dropdown */}
          {showNotifications && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)} />
              <div className="absolute right-0 mt-2 w-80 bg-background border border-border rounded-lg shadow-lg z-50">
                <div className="p-4 border-b border-border">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-foreground">Notifications</h3>
                    <button className="text-xs text-primary hover:underline">
                      Mark all as read
                    </button>
                  </div>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  <div className="p-3 hover:bg-muted cursor-pointer border-b border-border">
                    <div className="flex gap-2">
                      <span className="text-blue-500">🔵</span>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-foreground">
                          New comment on Ticket #123
                        </p>
                        <p className="text-xs text-muted-foreground">2 minutes ago</p>
                      </div>
                    </div>
                  </div>
                  <div className="p-3 hover:bg-muted cursor-pointer border-b border-border">
                    <div className="flex gap-2">
                      <span className="text-green-500">🟢</span>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-foreground">Invoice #456 paid</p>
                        <p className="text-xs text-muted-foreground">1 hour ago</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="p-3 border-t border-border text-center">
                  <a href="/notifications" className="text-sm text-primary hover:underline">
                    View all →
                  </a>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Workspace Switcher (Extension Point: header.workspaceMenu) */}
        <div className="hidden md:block">
          <WorkspaceSwitcher />
        </div>

        {/* User Menu (Extension Point: header.userMenu) */}
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-3 px-3 py-2 hover:bg-muted rounded-lg transition-colors"
          >
            {/* Avatar */}
            <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-white font-medium text-sm">
              {userInitials}
            </div>

            {/* User Info (hidden on mobile) */}
            <div className="hidden lg:block text-left">
              <p className="text-sm font-medium text-foreground">{user?.name || 'User'}</p>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
            </div>
          </button>

          {/* User Menu Dropdown */}
          {showUserMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
              <div className="absolute right-0 mt-2 w-64 bg-background border border-border rounded-lg shadow-lg z-50">
                {/* User Info */}
                <div className="p-4 border-b border-border">
                  <p className="text-sm font-medium text-foreground">{user?.name}</p>
                  <p className="text-xs text-muted-foreground">{user?.email}</p>
                  {tenant && (
                    <p className="text-xs text-muted-foreground mt-1">
                      <span className="font-medium">Tenant:</span> {tenant.name}
                    </p>
                  )}
                </div>

                {/* Menu Items */}
                <div className="py-1">
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      navigate({ to: '/workspace-settings' });
                    }}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                  >
                    <Settings className="w-4 h-4" />
                    Workspace Settings
                  </button>
                </div>

                <hr className="border-t border-border" />

                {/* Logout */}
                <div className="py-1">
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      handleLogout();
                    }}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-destructive hover:bg-muted transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    Logout
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
