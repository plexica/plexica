// File: packages/ui/src/components/JobDetailPanel/JobDetailPanel.stories.tsx
import type { Meta, StoryObj } from '@storybook/react-vite';
import { JobDetailPanel, type JobDetails } from './JobDetailPanel';

const meta: Meta<typeof JobDetailPanel> = {
  title: 'Components/JobDetailPanel',
  component: JobDetailPanel,
  tags: ['autodocs'],
};
export default meta;

type Story = StoryObj<typeof JobDetailPanel>;

const BASE_JOB: JobDetails = {
  id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  name: 'notifications.send-bulk',
  status: 'COMPLETED',
  payload: { tenantId: 'tenant-uuid', recipientCount: 42 },
  result: { sent: 42, failed: 0 },
  retries: 0,
  maxRetries: 3,
  createdAt: new Date('2026-03-01T09:00:00Z'),
  startedAt: new Date('2026-03-01T09:00:05Z'),
  completedAt: new Date('2026-03-01T09:00:12Z'),
};

const FAILED_JOB: JobDetails = {
  ...BASE_JOB,
  id: 'f1b2c3d4-e5f6-7890-abcd-ef1234567890',
  name: 'search.reindex',
  status: 'FAILED',
  error: 'Connection refused: PostgreSQL unreachable',
  retries: 3,
  completedAt: undefined,
};

const SCHEDULED_JOB: JobDetails = {
  ...BASE_JOB,
  id: 's1b2c3d4-e5f6-7890-abcd-ef1234567890',
  name: 'reports.daily-summary',
  status: 'SCHEDULED',
  cronExpression: '0 9 * * 1-5',
  scheduledAt: new Date('2026-03-03T09:00:00Z'),
  startedAt: undefined,
  completedAt: undefined,
  result: undefined,
};

const RUNNING_JOB: JobDetails = {
  ...BASE_JOB,
  id: 'r1b2c3d4-e5f6-7890-abcd-ef1234567890',
  status: 'RUNNING',
  startedAt: new Date(),
  completedAt: undefined,
};

export const Completed: Story = { args: { job: BASE_JOB, expanded: true } };
export const Failed: Story = {
  args: { job: FAILED_JOB, expanded: true, onRetry: (j) => alert(`Retry: ${j.id}`) },
};
export const Scheduled: Story = {
  args: {
    job: SCHEDULED_JOB,
    expanded: true,
    onDisableSchedule: (j) => alert(`Disable: ${j.id}`),
  },
};
export const Running: Story = { args: { job: RUNNING_JOB, expanded: true } };
export const Collapsed: Story = { args: { job: BASE_JOB, expanded: false } };
