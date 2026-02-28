// File: apps/web/src/components/Layout/Header.tsx

import React, { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { WorkspaceSwitcher } from '../WorkspaceSwitcher';
import { Menu, Search, Bell } from 'lucide-react';
import { ThemeToggle } from '../ui/ThemeToggle';
import { LanguageSelector } from '@plexica/ui';
import { useIntl } from '@/contexts';
import { UserProfileMenu } from '@/components/shell/UserProfileMenu';
import { useAuthStore } from '@/stores/auth.store';
import { useTenantTheme } from '@/contexts/ThemeContext';

interface HeaderProps {
  onMenuClick: () => void;
}

// Available locales for language selector
const AVAILABLE_LOCALES = [
  { code: 'en', name: 'English' },
  { code: 'it', name: 'Italiano' },
  // Add more locales as translations become available
  // { code: 'es', name: 'Español' },
  // { code: 'fr', name: 'Français' },
  // { code: 'de', name: 'Deutsch' },
];

const DEFAULT_LOGO_PLACEHOLDER = '/plexica-logo.svg';

export const Header: React.FC<HeaderProps> = ({ onMenuClick }) => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { locale, setLocale } = useIntl();
  const { tenantTheme } = useTenantTheme();
  const [showNotifications, setShowNotifications] = useState(false);
  const [logoError, setLogoError] = useState(false);

  // Derive tenant name from JWT claim (tenantId is slug in token, use displayName fallback)
  const tenantName = user?.tenantId ?? 'Plexica';

  // Resolve the logo URL: tenant logo (if valid and not errored) or placeholder
  const logoSrc = tenantTheme.logo && !logoError ? tenantTheme.logo : DEFAULT_LOGO_PLACEHOLDER;

  const handleLogoError = () => {
    setLogoError(true);
  };

  return (
    <header
      role="banner"
      className="h-16 bg-background border-b border-border flex items-center justify-between px-4 gap-4"
    >
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
        <button
          className="flex items-center gap-2 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
          onClick={() => void navigate({ to: '/' })}
          aria-label={`${tenantName} home`}
        >
          {tenantTheme.logo ? (
            <img
              src={logoSrc}
              alt={`${tenantName} logo`}
              className="h-8 md:h-10 max-w-[160px] object-contain"
              onError={handleLogoError}
              data-testid="tenant-logo"
            />
          ) : (
            <>
              <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center text-white font-bold">
                P
              </div>
              <span className="hidden md:block text-lg font-semibold text-foreground">
                {tenantName}
              </span>
            </>
          )}
        </button>
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
          </button>

          {/* Notifications Dropdown */}
          {showNotifications && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)} />
              <div className="absolute right-0 mt-2 w-80 bg-background border border-border rounded-lg shadow-lg z-50">
                <div className="p-4 border-b border-border">
                  <h3 className="font-semibold text-foreground">Notifications</h3>
                </div>
                <div className="p-6 text-center">
                  <div className="text-3xl mb-2">🔔</div>
                  <p className="text-sm text-muted-foreground">No notifications yet</p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Theme Toggle */}
        <ThemeToggle />

        {/* Language Selector */}
        <LanguageSelector
          locales={AVAILABLE_LOCALES}
          value={locale}
          onChange={setLocale}
          ariaLabel="Select language"
        />

        {/* Workspace Switcher (Extension Point: header.workspaceMenu) */}
        <div className="hidden md:block">
          <WorkspaceSwitcher />
        </div>

        {/* User Menu (Extension Point: header.userMenu) */}
        <UserProfileMenu />
      </div>
    </header>
  );
};
