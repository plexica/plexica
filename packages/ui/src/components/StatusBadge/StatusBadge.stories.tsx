import type { Meta, StoryObj } from '@storybook/react-vite';
import { StatusBadge } from './StatusBadge';

const meta: Meta<typeof StatusBadge> = {
  title: 'Components/StatusBadge',
  component: StatusBadge,
  tags: ['autodocs'],
};
export default meta;

type Story = StoryObj<typeof StatusBadge>;

export const Active: Story = { args: { status: 'active' } };
export const Inactive: Story = { args: { status: 'inactive' } };
export const Suspended: Story = { args: { status: 'suspended' } };
export const Draft: Story = { args: { status: 'draft' } };
export const Published: Story = { args: { status: 'published' } };
export const Deprecated: Story = { args: { status: 'deprecated' } };
export const Pending: Story = { args: { status: 'pending' } };
export const Archived: Story = { args: { status: 'archived' } };

export const CustomLabel: Story = {
  args: { status: 'active', label: 'Enabled' },
};

export const AllStatuses: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <StatusBadge status="active" />
      <StatusBadge status="inactive" />
      <StatusBadge status="suspended" />
      <StatusBadge status="draft" />
      <StatusBadge status="published" />
      <StatusBadge status="deprecated" />
      <StatusBadge status="pending" />
      <StatusBadge status="archived" />
    </div>
  ),
};
