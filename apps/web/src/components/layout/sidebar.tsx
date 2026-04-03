// sidebar.tsx
// Application sidebar navigation: expanded (240px ≥1024px), collapsed (64px), mobile drawer.
// Mobile drawer: WCAG 2.1 focus trap (§2.1.2), Escape + close button, focus restoration
// to trigger (§2.4.3), containment guard, and distinct landmark labels (§2.4.6).
// See git log for per-pass fix history.

import { useEffect, useRef } from 'react';
import { LayoutDashboard, X } from 'lucide-react';
import { useIntl } from 'react-intl';

import { SidebarNavItem } from './sidebar-nav-item.js';

interface SidebarProps {
  isOpen: boolean;
  isCollapsed: boolean;
  onToggle: () => void;
}

const NAV_ITEMS = [{ icon: LayoutDashboard, labelId: 'nav.dashboard', to: '/dashboard' }] as const;

// Selectors for all keyboard-focusable elements within the drawer
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

function SidebarContent({
  isCollapsed,
  intl,
}: {
  isCollapsed: boolean;
  intl: ReturnType<typeof useIntl>;
}): JSX.Element {
  return (
    <nav
      aria-label={intl.formatMessage({ id: 'nav.primaryNavigation' })}
      className="flex-1 overflow-y-auto p-2"
    >
      <ul className="space-y-1">
        {NAV_ITEMS.map((item) => (
          <SidebarNavItem
            key={item.to}
            icon={item.icon}
            label={intl.formatMessage({ id: item.labelId })}
            to={item.to}
            isCollapsed={isCollapsed}
          />
        ))}
      </ul>
    </nav>
  );
}

export function Sidebar({ isOpen, isCollapsed, onToggle }: SidebarProps): JSX.Element {
  const intl = useIntl();
  const drawerRef = useRef<HTMLDivElement>(null);

  // P6-M-1: Stores the element that had focus before the drawer opened so we can
  // restore it when the drawer closes (WCAG 2.4.3 Focus Order / ARIA APG dialog pattern).
  const returnFocusRef = useRef<HTMLElement | null>(null);

  // M-11: Focus trap + Escape handler for mobile drawer.
  // WCAG 2.1 §2.4.3 (Focus Order) and §2.1.2 (No Keyboard Trap) require that
  // keyboard users cannot Tab out of an open modal dialog, and that Escape closes it.
  useEffect(() => {
    if (!isOpen || drawerRef.current === null) return;

    const dialog = drawerRef.current;
    const getFocusables = (): NodeListOf<HTMLElement> =>
      dialog.querySelectorAll<HTMLElement>(FOCUSABLE);

    // P6-M-1: Capture the invoking element before moving focus into the drawer.
    returnFocusRef.current = document.activeElement as HTMLElement;

    // Move focus into the drawer on open
    getFocusables()[0]?.focus();

    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.preventDefault();
        onToggle();
        return;
      }

      if (e.key !== 'Tab') return;

      const focusables = getFocusables();
      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      // P8-I-1: Containment guard — if focus escaped the dialog via a programmatic
      // .focus() call from outside (test harness, extension, future UI code), recapture
      // it before the boundary checks. Satisfies WCAG 2.1 SC 2.1.2 for all Tab paths.
      if (!dialog.contains(document.activeElement)) {
        e.preventDefault();
        if (e.shiftKey) {
          last?.focus();
        } else {
          first?.focus();
        }
        return;
      }

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      // P6-M-1: Restore focus to the trigger on close (covers both Escape and backdrop-click
      // paths, since both call onToggle() which sets isOpen → false, triggering this cleanup).
      // P7-I-1: Skip restoration if the stored element is <body> — calling body.focus() is a
      // no-op per ARIA APG (acceptable when no prior keyboard focus existed), but a minority of
      // browsers may trigger a scroll jump. Skipping is safe: focus simply stays where it falls.
      const trigger = returnFocusRef.current;
      returnFocusRef.current = null;
      if (trigger !== null && trigger !== document.body) trigger.focus();
    };
  }, [isOpen, onToggle]);

  const brandName = intl.formatMessage({ id: 'brand.name' });

  return (
    <>
      {/* Mobile overlay backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          aria-hidden="true"
          tabIndex={-1}
          onClick={onToggle}
        />
      )}

      {/* Mobile drawer — role="dialog" + aria-modal per WCAG 2.1 §4.1.2
          P8-I-3: aria-label="Navigation" per design-spec — distinct from the brand name heading
          and from the inner <nav aria-label="Primary navigation"> (P6-M-2).
          id="sidebar-drawer": referenced by aria-controls in header.tsx on mobile viewports.
          Note: className="hidden" removes this from the AT when closed; aria-modal on a
          display:none element is safe. Do not change to visibility:hidden without re-testing. */}
      <div
        ref={drawerRef}
        id="sidebar-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={intl.formatMessage({ id: 'nav.sidebarDrawer' })}
        className={
          isOpen
            ? 'fixed left-0 top-0 z-40 flex h-full w-60 flex-col border-r border-neutral-200 bg-white lg:hidden'
            : 'hidden'
        }
      >
        {/* P8-I-2: Title bar with explicit close button — required by design-spec and needed
            for touch/switch-access users who cannot use Escape or tap the backdrop. */}
        <div className="flex h-16 items-center px-4 font-semibold text-neutral-900">
          <span>{brandName}</span>
          <button
            type="button"
            onClick={onToggle}
            aria-label={intl.formatMessage({ id: 'nav.closeDrawer' })}
            className="ml-auto rounded-md p-3 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <SidebarContent isCollapsed={false} intl={intl} />
      </div>

      {/* Desktop sidebar — <aside> provides the 'complementary' landmark by default.
          P6-M-2: aria-label="Sidebar" gives this complementary landmark a distinct name from
          the inner <nav aria-label="Primary navigation">, preventing duplicate landmark labels
          in the accessibility tree on desktop viewports. */}
      <aside
        id="sidebar-panel"
        className={`hidden lg:flex ${isCollapsed ? 'w-16' : 'w-60'} flex-col border-r border-neutral-200 bg-white transition-all duration-200`}
        aria-label={intl.formatMessage({ id: 'nav.sidebar' })}
      >
        <div className={`flex h-16 items-center ${isCollapsed ? 'justify-center' : 'px-4'}`}>
          {!isCollapsed && <span className="font-semibold text-neutral-900">{brandName}</span>}
        </div>
        <SidebarContent isCollapsed={isCollapsed} intl={intl} />
      </aside>
    </>
  );
}
