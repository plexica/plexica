// apps/web/src/components/Layout/SidebarNav.tsx
//
// T005-01: Redesigned sidebar with responsive overlay, full ARIA landmark
// management, collapsible plugin group, and keyboard navigation.
// Gated behind the ENABLE_NEW_SIDEBAR feature flag (Constitution Art. 9.1).
//
// FR-006, FR-007, FR-008, NFR-004, NFR-005

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from '@tanstack/react-router';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  HelpCircle,
  LayoutDashboard,
  Puzzle,
  Settings,
  Users,
} from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { usePlugins } from '../../contexts/PluginContext';

// ---------------------------------------------------------------------------
// Design-token constants (from design-spec §3)
// ---------------------------------------------------------------------------
const DESKTOP_BREAKPOINT = 1024; // px — below this, sidebar becomes overlay

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
export interface SidebarNavProps {
  /** Whether the overlay (mobile) sidebar is currently open. */
  isOpen: boolean;
  /** Callback to close the overlay sidebar. */
  onClose: () => void;
  /** Whether the desktop sidebar is in collapsed (icon-only) mode. */
  collapsed: boolean;
  /** Callback to toggle desktop collapsed state. */
  onCollapsedChange: (v: boolean) => void;
}

// ---------------------------------------------------------------------------
// Core nav items (static, always rendered)
// ---------------------------------------------------------------------------
interface CoreMenuItem {
  label: string;
  path: string;
  icon: React.ReactNode;
}

const CORE_ITEMS: CoreMenuItem[] = [
  {
    label: 'Dashboard',
    path: '/',
    icon: <LayoutDashboard className="w-5 h-5" aria-hidden="true" />,
  },
  { label: 'Team', path: '/team', icon: <Users className="w-5 h-5" aria-hidden="true" /> },
  {
    label: 'Settings',
    path: '/settings',
    icon: <Settings className="w-5 h-5" aria-hidden="true" />,
  },
];

// ---------------------------------------------------------------------------
// Helper: resolve a lucide icon by name string
// ---------------------------------------------------------------------------
function getIcon(iconName?: string): React.ReactNode {
  if (!iconName) return <Puzzle className="w-5 h-5" aria-hidden="true" />;
  const IconComponent = (
    LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>
  )[iconName];
  return IconComponent ? (
    <IconComponent className="w-5 h-5" aria-hidden="true" />
  ) : (
    <Puzzle className="w-5 h-5" aria-hidden="true" />
  );
}

// ---------------------------------------------------------------------------
// SidebarNav
// ---------------------------------------------------------------------------
export const SidebarNav: React.FC<SidebarNavProps> = ({
  isOpen,
  onClose,
  collapsed,
  onCollapsedChange,
}) => {
  const location = useLocation();
  const { menuItems, isLoading } = usePlugins();
  const [pluginsExpanded, setPluginsExpanded] = useState(true);
  const navRef = useRef<HTMLElement>(null);

  // Whether we are in mobile/tablet viewport (overlay mode)
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < DESKTOP_BREAKPOINT : false
  );

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < DESKTOP_BREAKPOINT);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // -------------------------------------------------------------------------
  // Focus trap when overlay is open (mobile)
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!isMobile || !isOpen) return;

    const nav = navRef.current;
    if (!nav) return;

    // Move focus to the first focusable element
    const focusableSelectors = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusableElements = Array.from(nav.querySelectorAll<HTMLElement>(focusableSelectors));

    if (focusableElements.length > 0) {
      focusableElements[0].focus();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      if (e.key === 'Tab') {
        if (focusableElements.length === 0) return;
        const first = focusableElements[0];
        const last = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }

      if (e.key === 'Home') {
        e.preventDefault();
        focusableElements[0]?.focus();
      }
      if (e.key === 'End') {
        e.preventDefault();
        focusableElements[focusableElements.length - 1]?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isMobile, isOpen, onClose]);

  // -------------------------------------------------------------------------
  // Desktop keyboard nav (Home / End) — no focus trap
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (isMobile) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!navRef.current?.contains(document.activeElement)) return;
      const nav = navRef.current;
      if (!nav) return;

      const focusableSelectors = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';
      const focusableElements = Array.from(nav.querySelectorAll<HTMLElement>(focusableSelectors));

      if (e.key === 'Home') {
        e.preventDefault();
        focusableElements[0]?.focus();
      }
      if (e.key === 'End') {
        e.preventDefault();
        focusableElements[focusableElements.length - 1]?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isMobile]);

  // -------------------------------------------------------------------------
  // Active route detection
  // -------------------------------------------------------------------------
  const isActive = useCallback(
    (path: string, exact = true): boolean => {
      if (exact) return location.pathname === path;
      return location.pathname === path || location.pathname.startsWith(path + '/');
    },
    [location.pathname]
  );

  // -------------------------------------------------------------------------
  // Nav item class builder
  // -------------------------------------------------------------------------
  const itemClass = (active: boolean) =>
    [
      'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors w-full',
      collapsed && !isMobile ? 'justify-center px-2' : '',
      active
        ? 'bg-primary text-primary-foreground'
        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
    ]
      .filter(Boolean)
      .join(' ');

  // -------------------------------------------------------------------------
  // Overlay: rendered on top of content on mobile when isOpen
  // -------------------------------------------------------------------------
  const isOverlayMode = isMobile;

  if (isOverlayMode && !isOpen) return null;

  return (
    <>
      {/* Backdrop — overlay mode only */}
      {isOverlayMode && (
        <div
          className="fixed inset-0 z-40 bg-black/50"
          style={{ backdropFilter: 'blur(2px)' }}
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar panel */}
      <nav
        ref={navRef}
        role="navigation"
        aria-label="Main navigation"
        aria-modal={isOverlayMode ? 'true' : undefined}
        className={[
          'bg-background border-r border-border flex flex-col z-50',
          'transition-all duration-300',
          isOverlayMode
            ? 'fixed top-0 left-0 h-full w-[280px] shadow-xl'
            : collapsed
              ? 'w-16'
              : 'w-60',
        ].join(' ')}
      >
        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto py-4">
          {/* ---- Core items ---- */}
          <div className="px-3 py-2">
            {!collapsed && !isOverlayMode && (
              <p className="mb-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Core
              </p>
            )}
            {CORE_ITEMS.map((item) => {
              const active = isActive(item.path, item.path === '/');
              return (
                <Link key={item.path} to={item.path} onClick={isOverlayMode ? onClose : undefined}>
                  <div className={itemClass(active)} aria-current={active ? 'page' : undefined}>
                    <span className="flex-shrink-0">{item.icon}</span>
                    {(!collapsed || isOverlayMode) && <span className="flex-1">{item.label}</span>}
                  </div>
                </Link>
              );
            })}
          </div>

          <hr className="my-2 border-t border-border" />

          {/* ---- Plugins group ---- */}
          <div className="px-3 py-2" role="group" aria-label="Plugins">
            {/* Plugins section header / toggle */}
            {(!collapsed || isOverlayMode) && (
              <button
                onClick={() => setPluginsExpanded((v) => !v)}
                className="flex items-center justify-between w-full mb-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
                aria-expanded={pluginsExpanded}
                aria-controls="sidebar-plugins-list"
              >
                <span>Plugins</span>
                {pluginsExpanded ? (
                  <ChevronUp className="w-3 h-3" aria-hidden="true" />
                ) : (
                  <ChevronDown className="w-3 h-3" aria-hidden="true" />
                )}
              </button>
            )}

            {/* Plugin items list */}
            <div
              id="sidebar-plugins-list"
              hidden={!collapsed || isOverlayMode ? !pluginsExpanded : false}
            >
              {isLoading && (!collapsed || isOverlayMode) && (
                <p className="px-3 py-2 text-sm text-muted-foreground">Loading plugins…</p>
              )}
              {!isLoading && menuItems.length === 0 && (!collapsed || isOverlayMode) && (
                <p className="px-3 py-2 text-sm text-muted-foreground">No plugins installed</p>
              )}
              {!isLoading &&
                menuItems.map((item) => {
                  const active = isActive(item.path ?? '', false);
                  return (
                    <Link
                      key={item.id}
                      to={item.path ?? '/'}
                      onClick={isOverlayMode ? onClose : undefined}
                    >
                      <div className={itemClass(active)} aria-current={active ? 'page' : undefined}>
                        <span className="flex-shrink-0">{getIcon(item.icon)}</span>
                        {(!collapsed || isOverlayMode) && (
                          <>
                            <span className="flex-1">{item.label}</span>
                            {item.badge && (
                              <span className="px-2 py-0.5 text-xs rounded-full bg-primary text-primary-foreground">
                                {item.badge}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </Link>
                  );
                })}
            </div>
          </div>

          <hr className="my-2 border-t border-border" />

          {/* ---- Help ---- */}
          <div className="px-3 py-2">
            <a href="/help" className={itemClass(false)}>
              <span className="flex-shrink-0">
                <HelpCircle className="w-5 h-5" aria-hidden="true" />
              </span>
              {(!collapsed || isOverlayMode) && <span className="flex-1">Help &amp; Support</span>}
            </a>
          </div>
        </div>

        {/* Collapse toggle — desktop only */}
        {!isOverlayMode && (
          <div className="border-t p-2">
            <button
              onClick={() => onCollapsedChange(!collapsed)}
              className="w-full flex items-center justify-center p-2 rounded hover:bg-muted transition-colors"
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? (
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              ) : (
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>
        )}
      </nav>
    </>
  );
};
