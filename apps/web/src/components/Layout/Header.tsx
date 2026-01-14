// File: apps/web/src/components/Layout/Header.tsx

import React, { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useAuth } from '../AuthProvider';
import { useAuthStore } from '@/stores/auth-store';
import { WorkspaceSwitcher } from '../WorkspaceSwitcher';

interface HeaderProps {
  onMenuClick: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onMenuClick }) => {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { user, tenant } = useAuthStore();
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
  };

  return (
    <header className="h-16 bg-card border-b border-border flex items-center justify-between px-4 gap-4">
      {/* Left: Menu Button (mobile) */}
      <button
        onClick={onMenuClick}
        className="p-2 hover:bg-muted rounded-lg transition-colors md:hidden"
        aria-label="Toggle menu"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 6h16M4 12h16M4 18h16"
          />
        </svg>
      </button>

      {/* Center Left: Tenant Name (hidden on mobile) */}
      <div className="hidden md:block">
        <h1 className="text-lg font-semibold text-foreground">{tenant?.name || 'Plexica'}</h1>
      </div>

      {/* Center: Workspace Switcher */}
      <div className="flex-1 flex justify-center md:justify-start">
        <WorkspaceSwitcher />
      </div>

      {/* Right: User Menu */}
      <div className="relative">
        <button
          onClick={() => setUserMenuOpen(!userMenuOpen)}
          className="flex items-center gap-3 px-3 py-2 hover:bg-muted rounded-lg transition-colors"
        >
          {/* Avatar */}
          <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-white font-medium">
            {user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'}
          </div>

          {/* User Info (hidden on mobile) */}
          <div className="hidden lg:block text-left">
            <p className="text-sm font-medium text-foreground">{user?.name || 'User'}</p>
            <p className="text-xs text-muted-foreground">{user?.email}</p>
          </div>

          {/* Dropdown Arrow */}
          <svg
            className={`w-4 h-4 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Dropdown Menu */}
        {userMenuOpen && (
          <>
            {/* Backdrop */}
            <div className="fixed inset-0 z-10" onClick={() => setUserMenuOpen(false)} />

            {/* Menu */}
            <div className="absolute right-0 mt-2 w-64 bg-card border border-border rounded-lg shadow-lg z-20">
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
              <div className="py-2">
                <button className="w-full px-4 py-2 text-left text-sm text-foreground hover:bg-muted transition-colors">
                  Profile Settings
                </button>
                <button
                  onClick={() => {
                    navigate({ to: '/workspace-settings' });
                    setUserMenuOpen(false);
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-foreground hover:bg-muted transition-colors"
                >
                  Workspace Settings
                </button>
              </div>

              {/* Logout */}
              <div className="border-t border-border py-2">
                <button
                  onClick={handleLogout}
                  className="w-full px-4 py-2 text-left text-sm text-destructive hover:bg-muted transition-colors"
                >
                  Logout
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </header>
  );
};
