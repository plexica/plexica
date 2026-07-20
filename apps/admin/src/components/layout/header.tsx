// header.tsx
// Admin header with sidebar toggle and logout action.

import { FormattedMessage } from 'react-intl';
import { Menu, LogOut } from 'lucide-react';

import { useAuthStore } from '../../stores/auth-store.js';

interface HeaderProps {
  onToggleSidebar: () => void;
}

export function AdminHeader({ onToggleSidebar }: HeaderProps): JSX.Element {
  const userProfile = useAuthStore((s) => s.userProfile);
  const logout = useAuthStore((s) => s.logout);

  return (
    <header className="flex h-16 items-center justify-between border-b border-neutral-200 bg-white px-4 lg:px-6">
      <button
        type="button"
        onClick={onToggleSidebar}
        className="rounded-md p-2 text-neutral-600 hover:bg-neutral-100 lg:hidden"
        aria-label="Toggle sidebar"
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
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100"
        >
          <LogOut className="h-4 w-4" />
          <FormattedMessage id="admin.logout" />
        </button>
      </div>
    </header>
  );
}
