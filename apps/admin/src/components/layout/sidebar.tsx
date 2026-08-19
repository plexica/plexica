// sidebar.tsx
// Admin sidebar navigation. Lucide icons only (no emoji, Rule 3).
//
// Decision 7 (2026-08-18): Added focus trap (WCAG 2.1 §2.1.2), Escape key
// handler, focus restore, role="dialog" + aria-modal for the mobile drawer.
// Fixed the startsWith active state bug (/tenants no longer matches
// /tenants/$id).

import { useEffect, useRef } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Link, useLocation } from '@tanstack/react-router';
import {
  LayoutDashboard,
  Building2,
  PlusCircle,
  Puzzle,
  HeartPulse,
  ScrollText,
  Radio,
  AlertTriangle,
} from 'lucide-react';

interface NavItem {
  to: string;
  labelId: string;
  icon: typeof LayoutDashboard;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', labelId: 'admin.nav.dashboard', icon: LayoutDashboard },
  { to: '/tenants', labelId: 'admin.nav.tenants', icon: Building2 },
  { to: '/provision', labelId: 'admin.nav.provision', icon: PlusCircle },
  { to: '/plugins', labelId: 'admin.nav.plugins', icon: Puzzle },
  { to: '/health', labelId: 'admin.nav.health', icon: HeartPulse },
  { to: '/logs', labelId: 'admin.nav.logs', icon: ScrollText },
  { to: '/kafka', labelId: 'admin.nav.kafka', icon: Radio },
  { to: '/dlq', labelId: 'admin.nav.dlq', icon: AlertTriangle },
];

const SIDEBAR_ID = 'admin-sidebar';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Returns true if the current pathname matches the nav item's route.
 * Uses exact match + segment boundary to prevent /tenants matching /tenants/$id.
 */
function isActive(pathname: string, itemTo: string): boolean {
  if (pathname === itemTo) return true;
  return pathname.startsWith(itemTo + '/');
}

export function AdminSidebar({ open, onClose }: SidebarProps): JSX.Element {
  const location = useLocation();
  const intl = useIntl();
  const asideRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  // Focus trap + Escape handler for mobile drawer.
  useEffect(() => {
    if (!open) return;

    const aside = asideRef.current;
    if (!aside) return;

    // Save the element that had focus before opening (the toggle button).
    triggerRef.current = document.activeElement as HTMLButtonElement | null;

    // Move focus into the sidebar.
    const firstFocusable = aside.querySelector<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    firstFocusable?.focus();

    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      // Focus trap: keep Tab within the sidebar.
      const asideEl = asideRef.current;
      if (!asideEl) return;
      const focusables = Array.from(
        asideEl.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null);
      if (focusables.length === 0) return;

      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      // Restore focus to the toggle button on close.
      triggerRef.current?.focus();
    };
  }, [open, onClose]);

  const sidebarLabel = intl.formatMessage({ id: 'admin.nav.sidebarLabel' });

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/30 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        ref={asideRef}
        id={SIDEBAR_ID}
        className={`fixed inset-y-0 left-0 z-40 w-64 transform border-r border-neutral-200 bg-white transition-transform lg:static lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        role={open ? 'dialog' : undefined}
        aria-modal={open ? 'true' : undefined}
        aria-label={open ? sidebarLabel : undefined}
      >
        <div className="flex h-16 items-center border-b border-neutral-200 px-6">
          <span className="text-sm font-bold text-neutral-900">
            <FormattedMessage id="admin.app.name" />
          </span>
        </div>
        <nav className="mt-2 space-y-1 px-3">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isActive(location.pathname, item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={onClose}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
                  active
                    ? 'bg-neutral-100 text-neutral-900'
                    : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900'
                }`}
              >
                <Icon className="h-4 w-4" />
                <FormattedMessage id={item.labelId} />
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
