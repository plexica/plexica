// header.tsx
// Admin header with sidebar toggle and logout action.
//
// Decision 7 (2026-08-18): Added aria-expanded, aria-controls, and i18n
// aria-label (was hardcoded English). Closes WCAG 2.1 AA gap.

import { FormattedMessage, useIntl } from 'react-intl';
import { Menu, LogOut } from 'lucide-react';

import { useAuthStore } from '../../stores/auth-store.js';

interface HeaderProps {
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
}

const SIDEBAR_ID = 'admin-sidebar';

export function AdminHeader({ isSidebarOpen, onToggleSidebar }: HeaderProps): JSX.Element {
  const userProfile = useAuthStore((s) => s.userProfile);
  const logout = useAuthStore((s) => s.logout);
  const intl = useIntl();

  return (
    <header className="flex h-16 items-center justify-between border-b border-neutral-200 bg-white px-4 lg:px-6">
      <button
        type="button"
        onClick={onToggleSidebar}
        className="rounded-md p-2 text-neutral-600 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 lg:hidden"
        aria-label={intl.formatMessage({ id: 'admin.nav.toggleSidebar' })}
        aria-expanded={isSidebarOpen}
        aria-controls={SIDEBAR_ID}
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="flex items-center gap-3">
        <span className="text-sm text-neutral-600">
          {userProfile?.email ?? ''}
        </span>
        <button
          type="button"
          onClick={() => void logout()}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
        >
          <LogOut className="h-4 w-4" />
          <FormattedMessage id="admin.logout" />
        </button>
      </div>
    </header>
  );
}
