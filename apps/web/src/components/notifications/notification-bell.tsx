// notification-bell.tsx
// Header notification bell (006-01/006-02): Radix DropdownMenu preview of the
// latest unread notifications + unread badge. Mounted in the header, so it is
// also the app-wide SSE invalidation subscriber (real-time refresh path).

import { useIntl } from 'react-intl';
import { Link } from '@tanstack/react-router';
import { Bell } from 'lucide-react';
import {
  DropdownMenuContent,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@plexica/ui';

import {
  useNotifications,
  useSseNotificationInvalidation,
  useUnreadCount,
} from '../../hooks/use-notifications.js';

import { NotificationItem } from './notification-item.js';

export function NotificationBell(): JSX.Element {
  const intl = useIntl();
  // Global SSE invalidation subscriber — always mounted with the header.
  useSseNotificationInvalidation();

  const { data: unreadTotal } = useUnreadCount();
  const { data: list } = useNotifications(1, 5, 'unread');
  const unread = unreadTotal ?? 0;
  const preview = list?.data ?? [];

  return (
    <DropdownMenuRoot>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={intl.formatMessage({ id: 'notifications.bell.ariaLabel' })}
          data-testid="notification-bell"
          className="relative rounded-md p-2 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
        >
          <Bell className="h-5 w-5" aria-hidden="true" />
          {unread > 0 && (
            <span
              data-testid="notification-badge"
              className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white"
            >
              {/* Overflow badge cap ("99+") is a count threshold, not UI copy */}
              {/* eslint-disable-next-line formatjs/no-literal-string-in-jsx -- numeric badge cap */}
              {unread > 99 ? '99+' : String(unread)}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuPortal>
        <DropdownMenuContent
          align="end"
          sideOffset={8}
          className="z-50 w-80 rounded-md border border-neutral-200 bg-white p-1 shadow-lg"
        >
          <div className="px-2 py-1.5 text-sm font-semibold text-neutral-900">
            {intl.formatMessage({ id: 'notifications.bell.title' })}
          </div>
          <DropdownMenuSeparator className="my-1 h-px bg-neutral-100" />

          {preview.length === 0 ? (
            <p className="px-2 py-4 text-center text-sm text-neutral-500">
              {intl.formatMessage({ id: 'notifications.bell.empty' })}
            </p>
          ) : (
            <ul
              className="max-h-80 overflow-y-auto"
              aria-label={intl.formatMessage({ id: 'notifications.bell.title' })}
            >
              {preview.map((notification) => (
                <NotificationItem key={notification.id} notification={notification} />
              ))}
            </ul>
          )}

          <DropdownMenuSeparator className="my-1 h-px bg-neutral-100" />
          <div className="p-1">
            <Link
              to="/notifications"
              data-testid="notification-view-all"
              className="block rounded px-2 py-1.5 text-center text-sm font-medium text-primary-700 hover:bg-primary-50"
            >
              {intl.formatMessage({ id: 'notifications.bell.viewAll' })}
            </Link>
          </div>
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenuRoot>
  );
}
