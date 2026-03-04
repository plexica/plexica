// File: apps/super-admin/src/components/AdminSidebarNav.tsx
//
// Shared sidebar navigation component for admin portals (Spec 008 T008-40).
// Supports roving tabindex keyboard navigation, mobile overlay dialog,
// skip-nav link, WCAG 2.1 AA aria attributes, and CSS token styling.

import React, { useEffect, useRef, useCallback } from 'react';
import { Link, useLocation } from '@tanstack/react-router';
import type { LucideIcon } from 'lucide-react';
import { X } from 'lucide-react';

export interface NavItem {
  label: string;
  icon: LucideIcon;
  path: string;
  badge?: number;
}

export interface AdminSidebarNavProps {
  /** Navigation items to render */
  navItems: NavItem[];
  /** Whether the sidebar is collapsed (used for mobile overlay control) */
  collapsed: boolean;
  /** Callback to toggle collapsed state */
  onToggle: () => void;
  /** Accessible label for the <nav> element */
  portalLabel: string;
}

/**
 * AdminSidebarNav — accessible sidebar navigation for admin portals.
 *
 * Desktop (≥1024px): permanently visible, rendered inline in layout.
 * Mobile (≤768px): rendered as a `role="dialog"` overlay when !collapsed.
 *
 * Keyboard navigation:
 *   ArrowDown / ArrowUp — move focus between items (roving tabindex)
 *   Home / End          — jump to first / last item
 *   Enter / Space       — activate focused link
 *   Escape              — close mobile overlay
 */
export const AdminSidebarNav: React.FC<AdminSidebarNavProps> = ({
  navItems,
  collapsed,
  onToggle,
  portalLabel,
}) => {
  const location = useLocation();
  const itemRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const focusedIndexRef = useRef<number>(0);

  const isActive = useCallback(
    (path: string) => {
      if (path === '/') return location.pathname === '/';
      return location.pathname.startsWith(path);
    },
    [location.pathname]
  );

  // Initialise focused index to the active item (or 0)
  useEffect(() => {
    const activeIdx = navItems.findIndex((item) => isActive(item.path));
    focusedIndexRef.current = activeIdx >= 0 ? activeIdx : 0;
  }, [navItems, isActive]);

  // Trap Escape key on mobile overlay
  useEffect(() => {
    if (collapsed) return; // overlay is closed
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onToggle();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [collapsed, onToggle]);

  /** Update roving tabindex and move DOM focus to item at `index`. */
  const moveFocus = useCallback((index: number) => {
    focusedIndexRef.current = index;
    // Update tabIndex on all items
    itemRefs.current.forEach((el, i) => {
      if (el) el.tabIndex = i === index ? 0 : -1;
    });
    itemRefs.current[index]?.focus();
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLUListElement>) => {
      const count = navItems.length;
      const current = focusedIndexRef.current;
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          moveFocus((current + 1) % count);
          break;
        case 'ArrowUp':
          e.preventDefault();
          moveFocus((current - 1 + count) % count);
          break;
        case 'Home':
          e.preventDefault();
          moveFocus(0);
          break;
        case 'End':
          e.preventDefault();
          moveFocus(count - 1);
          break;
      }
    },
    [navItems.length, moveFocus]
  );

  const navContent = (
    <nav aria-label={portalLabel} className="flex flex-col h-full">
      {/* Skip-nav link — visible on focus only */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-2 focus:bg-background focus:border focus:border-border focus:rounded focus:text-foreground focus:text-sm"
      >
        Skip to main content
      </a>

      <ul
        role="list"
        className="flex-1 overflow-y-auto py-4 px-2 space-y-1"
        onKeyDown={handleKeyDown}
      >
        {navItems.map((item, index) => {
          const active = isActive(item.path);
          const Icon = item.icon;
          const isFirstItem = index === 0;

          return (
            <li key={item.path} role="none">
              <Link
                to={item.path}
                ref={(el) => {
                  itemRefs.current[index] = el;
                }}
                tabIndex={active || isFirstItem ? 0 : -1}
                aria-current={active ? 'page' : undefined}
                onFocus={() => {
                  focusedIndexRef.current = index;
                }}
                className={[
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors w-full',
                  active
                    ? 'bg-muted text-foreground border-l-4 border-l-[var(--admin-nav-active-border)]'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <Icon className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
                <span className="flex-1">{item.label}</span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span
                    className="ml-auto inline-flex items-center justify-center rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground"
                    aria-label={`${item.badge} notifications`}
                  >
                    {item.badge}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );

  // ── Mobile overlay ────────────────────────────────────────────────────────
  // When !collapsed on a small viewport, render as a dialog overlay.
  // On desktop the parent layout controls visibility via CSS (always visible).
  return (
    <>
      {/* Desktop sidebar (always visible ≥1024px via parent layout) */}
      <div className="hidden lg:flex lg:w-60 lg:flex-col lg:border-r lg:bg-[var(--admin-header-bg)] lg:h-full">
        {navContent}
      </div>

      {/* Mobile overlay dialog */}
      {!collapsed && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-[var(--overlay-backdrop,rgba(0,0,0,0.5))]"
            onClick={onToggle}
            aria-hidden="true"
          />

          {/* Panel */}
          <div className="relative flex w-60 flex-col h-full bg-[var(--admin-header-bg)] border-r border-border shadow-xl">
            {/* Close button */}
            <div className="flex items-center justify-end px-3 py-2 border-b border-border">
              <button
                onClick={onToggle}
                aria-label="Close navigation"
                className="rounded p-1 hover:bg-muted transition-colors"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            {navContent}
          </div>
        </div>
      )}
    </>
  );
};

export default AdminSidebarNav;
