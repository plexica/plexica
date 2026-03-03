// File: packages/ui/src/components/NotificationBell/NotificationBell.tsx
// T007-25 — Notification bell with dropdown, unread count badge, and keyboard nav

import * as React from 'react';
import { Bell, CheckCheck, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '../Button/Button';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: Date | string;
  metadata?: {
    link?: string;
    pluginId?: string;
    [key: string]: unknown;
  };
}

export interface NotificationBellProps {
  /** Number of unread notifications (displayed as badge). */
  unreadCount?: number;
  /** Notifications to show in the dropdown. */
  notifications?: NotificationItem[];
  /** Called when a notification is clicked. */
  onNotificationClick?: (notification: NotificationItem) => void;
  /** Called when "Mark all read" is clicked. */
  onMarkAllRead?: () => void;
  /** Maximum notifications shown (default: 10). */
  maxVisible?: number;
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatRelative(date: Date | string): string {
  const d = new Date(date);
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(d);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
const NotificationBell = React.forwardRef<HTMLDivElement, NotificationBellProps>(
  (
    {
      unreadCount = 0,
      notifications = [],
      onNotificationClick,
      onMarkAllRead,
      maxVisible = 10,
      className,
    },
    ref
  ) => {
    const [open, setOpen] = React.useState(false);
    const [prevUnread, setPrevUnread] = React.useState(unreadCount);
    const [pulse, setPulse] = React.useState(false);
    const menuRef = React.useRef<HTMLDivElement>(null);
    const triggerRef = React.useRef<HTMLButtonElement>(null);
    const itemRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

    // Pulse animation when new notification arrives
    React.useEffect(() => {
      if (unreadCount > prevUnread) {
        setPulse(true);
        const t = setTimeout(() => setPulse(false), 2000);
        return () => clearTimeout(t);
      }
      setPrevUnread(unreadCount);
    }, [unreadCount, prevUnread]);

    // Close on outside click
    React.useEffect(() => {
      if (!open) return;
      const handler = (e: MouseEvent) => {
        if (
          menuRef.current &&
          !menuRef.current.contains(e.target as Node) &&
          triggerRef.current &&
          !triggerRef.current.contains(e.target as Node)
        ) {
          setOpen(false);
        }
      };
      document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    // Keyboard navigation inside dropdown
    const handleMenuKeyDown = (e: React.KeyboardEvent) => {
      const items = itemRefs.current.filter(Boolean) as HTMLButtonElement[];
      const focused = document.activeElement as HTMLButtonElement;
      const idx = items.indexOf(focused);

      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        items[Math.min(idx + 1, items.length - 1)]?.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (idx <= 0) {
          triggerRef.current?.focus();
        } else {
          items[idx - 1]?.focus();
        }
      }
    };

    const visible = notifications.slice(0, maxVisible);
    const cappedCount = unreadCount > 99 ? '99+' : unreadCount > 0 ? String(unreadCount) : null;

    return (
      <div ref={ref} className={cn('relative', className)}>
        {/* Bell trigger */}
        <button
          ref={triggerRef}
          className={cn(
            'relative p-2 rounded-lg hover:bg-muted transition-colors',
            pulse && 'animate-pulse'
          )}
          onClick={() => setOpen((v) => !v)}
          aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
          aria-haspopup="true"
          aria-expanded={open}
          aria-controls="notification-menu"
        >
          <Bell className="h-5 w-5" aria-hidden="true" />
          {cappedCount && (
            <span
              className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-destructive px-0.5 text-[10px] font-bold text-white"
              aria-hidden="true"
            >
              {cappedCount}
            </span>
          )}
        </button>

        {/* Dropdown */}
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
            <div
              id="notification-menu"
              ref={menuRef}
              role="menu"
              aria-label="Notifications"
              className="absolute right-0 z-50 mt-2 w-80 sm:w-96 rounded-xl border border-border bg-background shadow-xl"
              onKeyDown={handleMenuKeyDown}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <h3 className="font-semibold text-foreground">Notifications</h3>
                {unreadCount > 0 && onMarkAllRead && (
                  <Button variant="ghost" size="sm" onClick={onMarkAllRead} className="h-7 text-xs">
                    <CheckCheck className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                    Mark all read
                  </Button>
                )}
              </div>

              {/* Notification list */}
              <div className="max-h-[400px] overflow-y-auto">
                {visible.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <Bell className="mb-3 h-8 w-8 text-muted-foreground/40" aria-hidden="true" />
                    <p className="text-sm text-muted-foreground">No notifications</p>
                  </div>
                ) : (
                  <ul role="none">
                    {visible.map((n, idx) => (
                      <li key={n.id} role="none">
                        <button
                          ref={(el) => {
                            itemRefs.current[idx] = el;
                          }}
                          role="menuitem"
                          className={cn(
                            'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted',
                            !n.read && 'bg-primary/5'
                          )}
                          onClick={() => {
                            onNotificationClick?.(n);
                            setOpen(false);
                          }}
                        >
                          {/* Unread dot */}
                          <span
                            className={cn(
                              'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                              n.read ? 'bg-transparent' : 'bg-primary'
                            )}
                            aria-hidden="true"
                          />
                          <div className="min-w-0 flex-1">
                            <p
                              className={cn(
                                'text-sm',
                                !n.read && 'font-semibold text-foreground',
                                n.read && 'text-foreground'
                              )}
                            >
                              {n.title}
                            </p>
                            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                              {n.body}
                            </p>
                            <p className="mt-1 text-[10px] text-muted-foreground/70">
                              {formatRelative(n.createdAt)}
                            </p>
                          </div>
                          {n.metadata?.link && (
                            <ExternalLink
                              className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground/50"
                              aria-hidden="true"
                            />
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Footer */}
              {notifications.length > maxVisible && (
                <div className="border-t border-border px-4 py-2 text-center">
                  <p className="text-xs text-muted-foreground">
                    +{notifications.length - maxVisible} more notifications
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    );
  }
);
NotificationBell.displayName = 'NotificationBell';

export { NotificationBell };
