// File: packages/ui/src/components/NotificationBell/NotificationBell.stories.tsx
import type { Meta, StoryObj } from '@storybook/react-vite';
import { NotificationBell, type NotificationItem } from './NotificationBell';

const meta: Meta<typeof NotificationBell> = {
  title: 'Components/NotificationBell',
  component: NotificationBell,
  tags: ['autodocs'],
};
export default meta;

type Story = StoryObj<typeof NotificationBell>;

const NOTIFICATIONS: NotificationItem[] = [
  {
    id: '1',
    title: 'Plugin installed successfully',
    body: 'CRM Plugin v1.2.0 has been installed and is ready to use.',
    read: false,
    createdAt: new Date(Date.now() - 2 * 60_000),
  },
  {
    id: '2',
    title: 'Daily report ready',
    body: 'Your Q1 2026 summary report is ready to download.',
    read: false,
    createdAt: new Date(Date.now() - 15 * 60_000),
    metadata: { link: '/reports/q1-2026' },
  },
  {
    id: '3',
    title: 'Workspace member added',
    body: 'Alice Smith joined the Engineering workspace.',
    read: true,
    createdAt: new Date(Date.now() - 3 * 3600_000),
  },
  {
    id: '4',
    title: 'Backup completed',
    body: 'Tenant data backup completed successfully (2.4 GB).',
    read: true,
    createdAt: new Date(Date.now() - 24 * 3600_000),
  },
];

export const WithUnread: Story = {
  args: {
    unreadCount: 2,
    notifications: NOTIFICATIONS,
    onNotificationClick: (n) => alert(`Clicked: ${n.title}`),
    onMarkAllRead: () => alert('Mark all read'),
  },
};

export const Empty: Story = {
  args: { unreadCount: 0, notifications: [] },
};

export const ManyUnread: Story = {
  args: {
    unreadCount: 120,
    notifications: NOTIFICATIONS,
    onMarkAllRead: () => {},
  },
};

export const NoActions: Story = {
  args: { unreadCount: 1, notifications: [NOTIFICATIONS[0]!] },
};
