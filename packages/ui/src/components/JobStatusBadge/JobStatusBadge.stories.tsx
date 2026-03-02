// File: packages/ui/src/components/JobStatusBadge/JobStatusBadge.stories.tsx
import type { Meta, StoryObj } from '@storybook/react-vite';
import { JobStatusBadge } from './JobStatusBadge';

const meta: Meta<typeof JobStatusBadge> = {
  title: 'Components/JobStatusBadge',
  component: JobStatusBadge,
  tags: ['autodocs'],
};
export default meta;

type Story = StoryObj<typeof JobStatusBadge>;

export const Pending: Story = { args: { status: 'PENDING' } };
export const Queued: Story = { args: { status: 'QUEUED' } };
export const Running: Story = { args: { status: 'RUNNING' } };
export const Completed: Story = { args: { status: 'COMPLETED' } };
export const Failed: Story = { args: { status: 'FAILED' } };
export const Cancelled: Story = { args: { status: 'CANCELLED' } };
export const Scheduled: Story = { args: { status: 'SCHEDULED' } };

export const CustomLabel: Story = {
  args: { status: 'RUNNING', label: 'In Progress' },
};

export const AllStatuses: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <JobStatusBadge status="PENDING" />
      <JobStatusBadge status="QUEUED" />
      <JobStatusBadge status="RUNNING" />
      <JobStatusBadge status="COMPLETED" />
      <JobStatusBadge status="FAILED" />
      <JobStatusBadge status="CANCELLED" />
      <JobStatusBadge status="SCHEDULED" />
    </div>
  ),
};
