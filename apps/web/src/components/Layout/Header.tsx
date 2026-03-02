// File: apps/web/src/components/Layout/Header.tsx
// T007-31 — SearchOverlay integrated (replaces static search input)
// T007-32 — NotificationBell integrated (replaces static bell dropdown)

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { WorkspaceSwitcher } from '../WorkspaceSwitcher';
import { Menu, Search } from 'lucide-react';
import { ThemeToggle } from '../ui/ThemeToggle';
import { LanguageSelector, SearchOverlay, NotificationBell } from '@plexica/ui';
import type { SearchResultItem, NotificationItem } from '@plexica/ui';
import { useIntl } from '@/contexts';
import { UserProfileMenu } from '@/components/shell/UserProfileMenu';
import { useAuthStore } from '@/stores/auth.store';
import { useTenantTheme } from '@/contexts/ThemeContext';
import { useNotificationStream } from '@/hooks/useNotificationStream';

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
const API_URL = (import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:3000';
const MAX_RECENT_SEARCHES = 5;
const RECENT_SEARCHES_KEY = 'plexica-recent-searches';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

function saveRecentSearch(term: string): string[] {
  const existing = loadRecentSearches().filter((t) => t !== term);
  const updated = [term, ...existing].slice(0, MAX_RECENT_SEARCHES);
  try {
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
  } catch {
    // localStorage may be unavailable
  }
  return updated;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const Header: React.FC<HeaderProps> = ({ onMenuClick }) => {
  const navigate = useNavigate();
  const tokenSet = useAuthStore((s) => s.tokenSet);
  const token = tokenSet?.accessToken ?? null;
  const { locale, setLocale } = useIntl();
  const { tenantTheme } = useTenantTheme();
  const [logoError, setLogoError] = useState(false);

  // Search overlay state
  const [searchOpen, setSearchOpen] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>(loadRecentSearches);

  // Notification state
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const notificationsLoadedRef = useRef(false);

  // SSE: real-time unread count updates
  const { lastEvent: notifEvent } = useNotificationStream();

  // Derive tenant name from JWT claim
  const tenantId = useAuthStore((s) => s.user?.tenantId);
  const tenantName = tenantId ?? 'Plexica';

  // Resolve the logo URL
  const logoSrc = tenantTheme.logo && !logoError ? tenantTheme.logo : DEFAULT_LOGO_PLACEHOLDER;

  const handleLogoError = () => {
    setLogoError(true);
  };

  // -------------------------------------------------------------------------
  // Keyboard shortcut: '/' opens the search overlay (when no input focused)
  // -------------------------------------------------------------------------
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInputFocused =
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      if (e.key === '/' && !isInputFocused && !searchOpen) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [searchOpen]);

  // -------------------------------------------------------------------------
  // Load notifications on first open (lazy-load to avoid unnecessary requests)
  // -------------------------------------------------------------------------
  const fetchNotifications = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/api/v1/notifications?limit=20`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const body = (await res.json()) as {
        notifications: NotificationItem[];
        unreadCount: number;
      };
      setNotifications(body.notifications ?? []);
      setUnreadCount(body.unreadCount ?? 0);
      notificationsLoadedRef.current = true;
    } catch {
      // Non-critical — badge stays at 0
    }
  }, [token]);

  useEffect(() => {
    if (token && !notificationsLoadedRef.current) {
      void fetchNotifications();
    }
  }, [token, fetchNotifications]);

  // -------------------------------------------------------------------------
  // SSE: update unread count when a new notification arrives
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!notifEvent) return;
    const count = notifEvent.data.unreadCount;
    if (typeof count === 'number') {
      setUnreadCount(count);
    }
  }, [notifEvent]);

  // -------------------------------------------------------------------------
  // Search handler — calls POST /api/v1/search
  // -------------------------------------------------------------------------
  const handleSearch = useCallback(
    async (query: string): Promise<SearchResultItem[]> => {
      if (!token || !query.trim()) return [];
      try {
        const res = await fetch(`${API_URL}/api/v1/search`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ query, limit: 10 }),
        });
        if (!res.ok) return [];
        const body = (await res.json()) as { results: SearchResultItem[] };
        return body.results ?? [];
      } catch {
        return [];
      }
    },
    [token]
  );

  const handleSearchSelect = useCallback(
    (item: SearchResultItem) => {
      // Persist search term derived from result title
      const updated = saveRecentSearch(item.title);
      setRecentSearches(updated);
      // Navigate if the item has a navigable path (type used as fallback)
      void navigate({ to: `/${item.type}/${item.id}` });
    },
    [navigate]
  );

  const handleSearchClose = useCallback(() => {
    setSearchOpen(false);
  }, []);

  // -------------------------------------------------------------------------
  // Notification handlers
  // -------------------------------------------------------------------------
  const handleMarkAllRead = useCallback(async () => {
    if (!token) return;
    try {
      await fetch(`${API_URL}/api/v1/notifications/read-all`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {
      // Silently ignore
    }
  }, [token]);

  const handleNotificationClick = useCallback(
    async (notification: NotificationItem) => {
      // Mark individual notification as read
      if (!notification.read && token) {
        try {
          await fetch(`${API_URL}/api/v1/notifications/${notification.id}/read`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token}` },
          });
          setNotifications((prev) =>
            prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n))
          );
          setUnreadCount((c) => Math.max(0, c - 1));
        } catch {
          // Silently ignore
        }
      }
      // Navigate to the linked resource if present
      if (notification.metadata?.link) {
        void navigate({ to: notification.metadata.link as string });
      }
    },
    [token, navigate]
  );

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

      {/* Center Section - Global Search trigger (Extension Point: header.search) */}
      <div className="flex-1 max-w-md hidden lg:block">
        <button
          className="relative w-full flex items-center gap-2 pl-10 pr-4 py-2 bg-muted border border-border rounded-lg text-sm text-muted-foreground hover:bg-muted/80 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          onClick={() => setSearchOpen(true)}
          aria-label="Open search (press /)"
        >
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          Search everywhere…
          <kbd className="ml-auto font-mono text-xs border border-border rounded px-1">/</kbd>
        </button>
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-3">
        {/* Search icon for mobile */}
        <button
          className="p-2 hover:bg-muted rounded-lg transition-colors lg:hidden"
          aria-label="Search"
          onClick={() => setSearchOpen(true)}
        >
          <Search className="w-5 h-5" />
        </button>

        {/* Notifications Bell (Extension Point: header.notifications) */}
        <NotificationBell
          unreadCount={unreadCount}
          notifications={notifications}
          onMarkAllRead={() => void handleMarkAllRead()}
          onNotificationClick={(n) => void handleNotificationClick(n)}
        />

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

      {/* Search Overlay — rendered at root level via portal-like fixed positioning */}
      <SearchOverlay
        open={searchOpen}
        onClose={handleSearchClose}
        onSearch={handleSearch}
        onSelect={handleSearchSelect}
        recentSearches={recentSearches}
        placeholder="Search everywhere… (press / to open)"
      />
    </header>
  );
};
