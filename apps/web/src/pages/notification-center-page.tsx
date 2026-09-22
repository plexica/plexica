// notification-center-page.tsx
// Notification center (006-02): paginated list of the caller's notifications
// with mark-read and read-all actions. Route: /notifications.

import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Link } from '@tanstack/react-router';
import { BellOff, CheckCheck, Settings2 } from 'lucide-react';
import { Button, EmptyState, Pagination, SkeletonLoader } from '@plexica/ui';

import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useSseNotificationInvalidation,
} from '../hooks/use-notifications.js';
import { NotificationItem } from '../components/notifications/notification-item.js';

function CenterSkeleton(): JSX.Element {
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      <span className="sr-only"><FormattedMessage id="skeleton.loading" /></span>
      <SkeletonLoader className="h-9 w-24" />
      <SkeletonLoader variant="card" className="h-16" />
      <SkeletonLoader variant="card" className="h-16" />
      <SkeletonLoader variant="card" className="h-16" />
    </div>
  );
}

export function NotificationCenterPage(): JSX.Element {
  const intl = useIntl();
  const [page, setPage] = useState(1);
  useSseNotificationInvalidation();

  const { data, isPending, isError } = useNotifications(page, 10, 'all');
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  if (isPending) return <CenterSkeleton />;
  if (isError || data === undefined) {
    return (
      <p className="text-sm text-red-600">
        <FormattedMessage id="notifications.center.error" />
      </p>
    );
  }

  const items = data.data;
  const totalPages = data.totalPages;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-neutral-900">
          <FormattedMessage id="notifications.center.title" />
        </h1>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            asChild
          >
            <Link
              to="/notifications/preferences"
              aria-label={intl.formatMessage({ id: 'notifications.prefs.title' })}
            >
              <Settings2 className="mr-2 h-4 w-4" aria-hidden="true" />
              <FormattedMessage id="notifications.prefs.title" />
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => markAllRead.mutate()}
            disabled={markAllRead.isPending || data.total === 0}
            data-testid="mark-all-read"
          >
            <CheckCheck className="mr-2 h-4 w-4" aria-hidden="true" />
            <FormattedMessage id="notifications.center.markAllRead" />
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={BellOff}
          heading={<FormattedMessage id="notifications.center.empty" />}
          description={<FormattedMessage id="notifications.center.empty.description" />}
        />
      ) : (
        <ul className="space-y-2" aria-label={intl.formatMessage({ id: 'notifications.center.title' })}>
          {items.map((notification) => (
            <NotificationItem
              key={notification.id}
              notification={notification}
              onMarkRead={(id) => markRead.mutate(id)}
            />
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          onPageChange={(next) => {
            setPage(next);
            void window.scrollTo(0, 0);
          }}
        />
      )}
    </div>
  );
}