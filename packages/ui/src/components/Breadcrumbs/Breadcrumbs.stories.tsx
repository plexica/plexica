import type { Meta, StoryObj } from '@storybook/react-vite';
import { Breadcrumbs, BreadcrumbsWithHome } from './Breadcrumbs';

const meta: Meta<typeof Breadcrumbs> = {
  title: 'Components/Breadcrumbs',
  component: Breadcrumbs,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Breadcrumbs>;

export const Default: Story = {
  args: {
    items: [
      { label: 'Dashboard', href: '/dashboard' },
      { label: 'CRM', href: '/crm' },
      { label: 'Contacts', href: '/crm/contacts' },
      { label: 'John Doe', current: true },
    ],
  },
};

export const WithHome: Story = {
  render: () => (
    <BreadcrumbsWithHome
      items={[
        { label: 'CRM', href: '/crm' },
        { label: 'Contacts', href: '/crm/contacts' },
        { label: 'John Doe' },
      ]}
    />
  ),
};

export const Simple: Story = {
  args: {
    items: [{ label: 'Dashboard', href: '/dashboard' }, { label: 'Settings' }],
  },
};

export const Long: Story = {
  args: {
    items: [
      { label: 'Dashboard', href: '/dashboard' },
      { label: 'Workspace', href: '/workspace' },
      { label: 'Settings', href: '/workspace/settings' },
      { label: 'Users & Teams', href: '/workspace/users' },
      { label: 'Edit User' },
    ],
  },
};

export const CustomSeparator: Story = {
  args: {
    items: [
      { label: 'Dashboard', href: '/dashboard' },
      { label: 'CRM', href: '/crm' },
      { label: 'Contacts' },
    ],
    separator: <span className="text-text-secondary">/</span>,
  },
};
