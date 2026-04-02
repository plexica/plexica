// header.tsx
// Application header — top navigation bar (64px).
// Contains: hamburger/collapse toggle, breadcrumb, search placeholder, user menu.
//
// P5-H-1 fix: useMediaQuery resolves per-viewport aria-expanded and aria-controls so
//   - aria-expanded always reflects the VISIBLE controlled element's actual state
//   - aria-controls always points to the element the button actually toggles
//   On desktop (≥1024px): controls "sidebar-panel" (the <aside>), expanded = !isSidebarCollapsed
//   On mobile  (<1024px): controls "sidebar-drawer" (the dialog), expanded = isSidebarOpen

import { Menu } from 'lucide-react';
import { useIntl } from 'react-intl';

import { useMediaQuery } from '../../hooks/use-media-query.js';

import { Breadcrumb } from './breadcrumb.js';
import { UserMenu } from './user-menu.js';

interface HeaderProps {
  isSidebarOpen: boolean;
  isSidebarCollapsed: boolean;
  onToggleSidebar: () => void;
}

export function Header({
  isSidebarOpen,
  isSidebarCollapsed,
  onToggleSidebar,
}: HeaderProps): JSX.Element {
  const intl = useIntl();
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  // P5-H-1: aria attributes must reflect the element that is actually controlled.
  // Desktop: the <aside id="sidebar-panel"> is visible; its state is !isSidebarCollapsed.
  // Mobile:  the <div id="sidebar-drawer" role="dialog"> is the target; its state is isSidebarOpen.
  const ariaExpanded = isDesktop ? !isSidebarCollapsed : isSidebarOpen;
  const ariaControls = isDesktop ? 'sidebar-panel' : 'sidebar-drawer';

  return (
    <header
      role="banner"
      className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-neutral-200 bg-white px-4"
    >
      {/* Sidebar toggle
          aria-expanded / aria-controls are resolved per viewport (P5-H-1).
          WCAG 2.1 SC 4.1.2 — button correctly communicates the controlled element state. */}
      <button
        type="button"
        onClick={onToggleSidebar}
        aria-label={intl.formatMessage({ id: 'nav.toggle' })}
        aria-expanded={ariaExpanded}
        aria-controls={ariaControls}
        className="rounded-md p-3 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </button>

      {/* Breadcrumb */}
      <div className="min-w-0 flex-1">
        <Breadcrumb />
      </div>

      {/* Right: search placeholder + user menu */}
      <div className="flex items-center gap-3">
        <div
          role="search"
          aria-label={intl.formatMessage({ id: 'nav.search' })}
          className="hidden sm:block"
        >
          <input
            type="search"
            placeholder={intl.formatMessage({ id: 'header.search.placeholder' })}
            // M-12: placeholder is not a valid accessible label (WCAG 3.3.2, 4.1.2).
            // aria-label provides the accessible name that screen readers announce.
            aria-label={intl.formatMessage({ id: 'header.search.placeholder' })}
            className="h-8 w-48 rounded-md border border-neutral-200 bg-neutral-50 px-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        <UserMenu />
      </div>
    </header>
  );
}
