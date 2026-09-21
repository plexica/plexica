// notification-item.tsx
// A single notification row shared by the header bell dropdown and the center
// page (006-02). Titles are i18n keys resolved via react-intl; optional
// `titleParams` (interpolation values) ride the row metadata. No hardcoded
// strings (Rule: all UI strings via react-intl).

import { useIntl } from 'react-intl';
import { Link } from '@tanstack/react-router';
import { Check } from 'lucide-react';
import { Button } from '@plexica/ui';

import type { NotificationDto } from '../../types/notification.js';

interface NotificationItemProps {
  notification: NotificationDto;
  /** Mark-read handler; omitted hides the action (e.g. in the dropdown preview). */
  onMarkRead?: (id: string) => void;
}

function formatTimestamp(iso: string, intl: ReturnType<typeof useIntl>): string {
  return intl.formatDate(new Date(iso), {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function NotificationItem({ notification, onMarkRead }: NotificationItemProps): JSX.Element {
  const intl = useIntl();
  const metadata = (notification.metadata ?? {}) as Record<string, unknown>;
  const titleParams = metadata['titleParams'] as Record<string, string> | undefined;
  const rawLink = typeof metadata['link'] === 'string' ? metadata['link'] : undefined;
  // Only route-relative links may render as router <Link>. Anything else (an
  // absolute URL, a scheme) is rendered as plain text — never a raw anchor to a
  // potentially external destination (metadata.link guard, review finding).
  const link =
    rawLink !== undefined && rawLink.startsWith('/') && !/^[a-z][a-z0-9+.-]*:/i.test(rawLink)
      ? rawLink
      : undefined;

  const title = intl.formatMessage(
    { id: notification.titleKey, defaultMessage: notification.titleKey },
    titleParams
  );
  const body =
    notification.bodyKey === null || notification.bodyKey === undefined
      ? null
      : intl.formatMessage({ id: notification.bodyKey, defaultMessage: notification.bodyKey });

  const titleContent = link !== undefined ? <Link to={link}>{title}</Link> : title;

  return (
    <li
      data-testid="notification-item"
      className={`flex items-start gap-3 rounded-md px-3 py-2.5 ${
        notification.read ? 'bg-white' : 'bg-neutral-50'
      }`}
    >
      <div className="min-w-0 flex-1">
        <p
          className={`text-sm ${notification.read ? 'text-neutral-600' : 'font-medium text-neutral-900'}`}
        >
          {titleContent}
        </p>
        {body !== null && <p className="mt-0.5 text-xs text-neutral-500">{body}</p>}
        <time className="mt-1 block text-xs text-neutral-400" dateTime={notification.createdAt}>
          {formatTimestamp(notification.createdAt, intl)}
        </time>
      </div>

      {onMarkRead !== undefined && !notification.read && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onMarkRead(notification.id)}
          aria-label={intl.formatMessage({ id: 'notifications.markRead.ariaLabel' })}
          className="shrink-0"
        >
          <Check className="h-4 w-4" aria-hidden="true" />
        </Button>
      )}
    </li>
  );
}
