// File: packages/ui/src/components/NotificationBell/NotificationBell.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NotificationBell } from './NotificationBell';
import type { NotificationItem } from './NotificationBell';

const makeNotification = (overrides: Partial<NotificationItem> = {}): NotificationItem => ({
  id: 'notif-1',
  title: 'Test Notification',
  body: 'This is the body',
  read: false,
  createdAt: new Date('2025-01-01T12:00:00Z'),
  ...overrides,
});

describe('NotificationBell', () => {
  it('renders the bell button', () => {
    render(<NotificationBell />);
    expect(screen.getByRole('button', { name: /notifications/i })).toBeInTheDocument();
  });

  it('does not show badge when unreadCount is 0', () => {
    render(<NotificationBell unreadCount={0} />);
    // No numeric badge text
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('shows unread count badge when unreadCount > 0', () => {
    render(<NotificationBell unreadCount={5} />);
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('shows 99+ when unreadCount > 99', () => {
    render(<NotificationBell unreadCount={150} />);
    expect(screen.getByText('99+')).toBeInTheDocument();
  });

  it('includes unread count in aria-label', () => {
    render(<NotificationBell unreadCount={3} />);
    const btn = screen.getByRole('button', { name: /3 unread/i });
    expect(btn).toBeInTheDocument();
  });

  it('dropdown is not shown before clicking the bell', () => {
    render(<NotificationBell />);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('opens dropdown when bell is clicked', () => {
    render(<NotificationBell />);
    fireEvent.click(screen.getByRole('button', { name: /notifications/i }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('shows "No notifications" when empty', () => {
    render(<NotificationBell notifications={[]} />);
    fireEvent.click(screen.getByRole('button', { name: /notifications/i }));
    expect(screen.getByText('No notifications')).toBeInTheDocument();
  });

  it('renders notification titles in the dropdown', () => {
    const notifications = [
      makeNotification({ id: '1', title: 'Alert One' }),
      makeNotification({ id: '2', title: 'Alert Two', read: true }),
    ];
    render(<NotificationBell notifications={notifications} />);
    fireEvent.click(screen.getByRole('button', { name: /notifications/i }));
    expect(screen.getByText('Alert One')).toBeInTheDocument();
    expect(screen.getByText('Alert Two')).toBeInTheDocument();
  });

  it('calls onNotificationClick when a notification is clicked', () => {
    const onNotificationClick = vi.fn();
    const notifications = [makeNotification({ id: '1', title: 'Click Me' })];
    render(
      <NotificationBell notifications={notifications} onNotificationClick={onNotificationClick} />
    );
    fireEvent.click(screen.getByRole('button', { name: /notifications/i }));
    fireEvent.click(screen.getByText('Click Me'));
    expect(onNotificationClick).toHaveBeenCalledOnce();
    expect(onNotificationClick).toHaveBeenCalledWith(notifications[0]);
  });

  it('shows "Mark all read" button when there are unread notifications and onMarkAllRead is provided', () => {
    const onMarkAllRead = vi.fn();
    render(
      <NotificationBell
        unreadCount={2}
        notifications={[makeNotification()]}
        onMarkAllRead={onMarkAllRead}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /notifications/i }));
    const markAllBtn = screen.getByRole('button', { name: /mark all read/i });
    expect(markAllBtn).toBeInTheDocument();
  });

  it('calls onMarkAllRead when "Mark all read" is clicked', () => {
    const onMarkAllRead = vi.fn();
    render(
      <NotificationBell
        unreadCount={1}
        notifications={[makeNotification()]}
        onMarkAllRead={onMarkAllRead}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /notifications/i }));
    fireEvent.click(screen.getByRole('button', { name: /mark all read/i }));
    expect(onMarkAllRead).toHaveBeenCalledOnce();
  });

  it('does not show "Mark all read" when unreadCount is 0', () => {
    const onMarkAllRead = vi.fn();
    render(
      <NotificationBell
        unreadCount={0}
        notifications={[makeNotification({ read: true })]}
        onMarkAllRead={onMarkAllRead}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /notifications/i }));
    expect(screen.queryByRole('button', { name: /mark all read/i })).not.toBeInTheDocument();
  });

  it('closes the dropdown after clicking a notification', () => {
    const notifications = [makeNotification({ id: '1', title: 'Dismiss Me' })];
    render(<NotificationBell notifications={notifications} onNotificationClick={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /notifications/i }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Dismiss Me'));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('shows a "+ more" footer when notifications exceed maxVisible', () => {
    const notifications = Array.from({ length: 12 }, (_, i) =>
      makeNotification({ id: String(i), title: `Notif ${i}` })
    );
    render(<NotificationBell notifications={notifications} maxVisible={10} />);
    fireEvent.click(screen.getByRole('button', { name: /notifications/i }));
    expect(screen.getByText(/\+2 more/i)).toBeInTheDocument();
  });

  it('closes dropdown on Escape key', () => {
    render(<NotificationBell />);
    fireEvent.click(screen.getByRole('button', { name: /notifications/i }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
