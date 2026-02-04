// File: apps/super-admin/src/components/Layout/Header.tsx

import React, { useState } from 'react';
import { LogOut, Settings, Menu, Search, Bell, Activity } from 'lucide-react';
import { ThemeToggle } from '../ui/ThemeToggle';

interface HeaderProps {
  onMenuClick: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onMenuClick }) => {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  // Get user from localStorage (temporary, will be replaced with auth store)
  const userEmail = localStorage.getItem('super-admin-email') || 'admin@plexica.com';
  const userName = 'Super Admin';

  const handleLogout = () => {
    localStorage.removeItem('super-admin-auth');
    localStorage.removeItem('super-admin-email');
    window.location.href = '/login';
  };

  // User initials for avatar
  const userInitials = userName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase();

  return (
    <header className="h-16 bg-background border-b border-border flex items-center justify-between px-4 gap-4">
      {/* Left Section - Logo and Menu */}
      <div className="flex items-center gap-4">
        {/* Hamburger menu button for mobile */}
        <button
          onClick={onMenuClick}
          className="p-2 hover:bg-muted rounded-lg transition-colors md:hidden"
          aria-label="Toggle menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Logo/Brand */}
        <div className="flex items-center gap-3 cursor-pointer">
          <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center text-white font-bold">
            P
          </div>
          <div className="hidden md:block">
            <h1 className="text-lg font-semibold text-foreground">Plexica Super Admin</h1>
            <p className="text-xs text-muted-foreground">Platform Management</p>
          </div>
        </div>
      </div>

      {/* Center Section - Global Search */}
      <div className="flex-1 max-w-md hidden lg:block">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search tenants, users, plugins..."
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

        {/* Platform Status */}
        <div className="hidden md:flex items-center gap-2 px-3 py-2 bg-muted rounded-lg">
          <Activity className="w-4 h-4 text-green-500" />
          <span className="text-xs text-muted-foreground">All Systems Operational</span>
        </div>

        {/* Notifications Bell */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="p-2 hover:bg-muted rounded-lg transition-colors relative"
            aria-label="Notifications"
          >
            <Bell className="w-5 h-5" />
            {/* Badge with unread count */}
            <span className="absolute top-1 right-1 w-4 h-4 bg-primary text-white text-xs rounded-full flex items-center justify-center">
              2
            </span>
          </button>

          {/* Notifications Dropdown */}
          {showNotifications && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)} />
              <div className="absolute right-0 mt-2 w-80 bg-background border border-border rounded-lg shadow-lg z-50">
                <div className="p-4 border-b border-border">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-foreground">Platform Notifications</h3>
                    <button className="text-xs text-primary hover:underline">
                      Mark all as read
                    </button>
                  </div>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  <div className="p-3 hover:bg-muted cursor-pointer border-b border-border">
                    <div className="flex gap-2">
                      <span className="text-yellow-500">⚠️</span>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-foreground">
                          High API usage detected for tenant &quot;acme-corp&quot;
                        </p>
                        <p className="text-xs text-muted-foreground">5 minutes ago</p>
                      </div>
                    </div>
                  </div>
                  <div className="p-3 hover:bg-muted cursor-pointer border-b border-border">
                    <div className="flex gap-2">
                      <span className="text-green-500">✅</span>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-foreground">
                          New tenant &quot;techstart&quot; provisioned successfully
                        </p>
                        <p className="text-xs text-muted-foreground">1 hour ago</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="p-3 border-t border-border text-center">
                  <a href="/notifications" className="text-sm text-primary hover:underline">
                    View all notifications →
                  </a>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Theme Toggle */}
        <ThemeToggle />

        {/* User Menu */}
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
              <p className="text-sm font-medium text-foreground">{userName}</p>
              <p className="text-xs text-muted-foreground">{userEmail}</p>
            </div>
          </button>

          {/* User Menu Dropdown */}
          {showUserMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
              <div className="absolute right-0 mt-2 w-64 bg-background border border-border rounded-lg shadow-lg z-50">
                {/* User Info */}
                <div className="p-4 border-b border-border">
                  <p className="text-sm font-medium text-foreground">{userName}</p>
                  <p className="text-xs text-muted-foreground">{userEmail}</p>
                  <p className="text-xs text-primary mt-1 font-medium">Super Administrator</p>
                </div>

                {/* Menu Items */}
                <div className="py-1">
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      window.location.href = '/settings';
                    }}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                  >
                    <Settings className="w-4 h-4" />
                    Platform Settings
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
