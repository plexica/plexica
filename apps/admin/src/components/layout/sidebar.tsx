// sidebar.tsx
// Admin sidebar navigation. Lucide icons only (no emoji, Rule 3).

import { FormattedMessage } from 'react-intl';
import { Link, useLocation } from '@tanstack/react-router';
import {
  LayoutDashboard,
  Building2,
  PlusCircle,
  Puzzle,
  HeartPulse,
  ScrollText,
  Radio,
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
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export function AdminSidebar({ open, onClose }: SidebarProps): JSX.Element {
  const location = useLocation();

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
        className={`fixed inset-y-0 left-0 z-40 w-64 transform border-r border-neutral-200 bg-white transition-transform lg:static lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center border-b border-neutral-200 px-6">
          <span className="text-sm font-bold text-neutral-900">
            <FormattedMessage id="admin.app.name" />
          </span>
        </div>
        <nav className="mt-2 space-y-1 px-3">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = location.pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={onClose}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium ${
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
