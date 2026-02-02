import type { Meta, StoryObj } from '@storybook/react-vite';
import { EmptyState } from './EmptyState';
import { Users, Inbox, FileText, Search } from 'lucide-react';

const meta: Meta<typeof EmptyState> = {
  title: 'Components/EmptyState',
  component: EmptyState,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof EmptyState>;

export const NoContacts: Story = {
  args: {
    icon: <Users size={64} />,
    title: 'No contacts yet',
    description: 'Add your first contact to get started',
    action: {
      label: '+ Add Contact',
      onClick: () => alert('Add contact clicked'),
    },
    secondaryAction: {
      label: 'or import from CSV',
      onClick: () => alert('Import clicked'),
    },
  },
};

export const NoInvoices: Story = {
  args: {
    icon: <FileText size={64} />,
    title: 'No invoices found',
    description: 'Create your first invoice to start billing customers',
    action: {
      label: '+ Create Invoice',
      onClick: () => alert('Create invoice clicked'),
    },
  },
};

export const EmptyInbox: Story = {
  args: {
    icon: <Inbox size={64} />,
    title: 'Inbox is empty',
    description: 'You have no new notifications',
  },
};

export const NoSearchResults: Story = {
  args: {
    icon: <Search size={64} />,
    title: 'No results found',
    description: "Try adjusting your search or filter to find what you're looking for",
    action: {
      label: 'Clear filters',
      onClick: () => alert('Clear filters clicked'),
    },
  },
};

export const CustomIcon: Story = {
  render: () => (
    <EmptyState
      icon={<div className="text-6xl">📊</div>}
      title="No data available"
      description="Start collecting data to see analytics here"
      action={{
        label: 'Get Started',
        onClick: () => alert('Get started clicked'),
      }}
    />
  ),
};

export const Simple: Story = {
  args: {
    title: 'Nothing to see here',
    description: 'This area is currently empty',
  },
};
