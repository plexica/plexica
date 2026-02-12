import type { Meta, StoryObj } from '@storybook/react-vite';
import { StatCard } from './StatCard';
import { Users, DollarSign, BarChart3, Activity } from 'lucide-react';

const meta: Meta<typeof StatCard> = {
  title: 'Components/StatCard',
  component: StatCard,
  tags: ['autodocs'],
};
export default meta;

type Story = StoryObj<typeof StatCard>;

export const Default: Story = {
  args: {
    label: 'Total Users',
    value: '12,345',
  },
};

export const WithTrendUp: Story = {
  args: {
    label: 'Revenue',
    value: '$45,231',
    trend: 12.5,
  },
};

export const WithTrendDown: Story = {
  args: {
    label: 'Churn Rate',
    value: '2.4%',
    trend: -3.2,
  },
};

export const WithIcon: Story = {
  args: {
    label: 'Active Users',
    value: '8,901',
    icon: <Users className="h-6 w-6" />,
  },
};

export const WithIconAndTrend: Story = {
  args: {
    label: 'Monthly Revenue',
    value: '$124,500',
    trend: 8.3,
    icon: <DollarSign className="h-6 w-6" />,
  },
};

export const NumericValue: Story = {
  args: {
    label: 'Page Views',
    value: 98765,
    trend: 5.0,
    icon: <BarChart3 className="h-6 w-6" />,
  },
};

export const ZeroTrend: Story = {
  args: {
    label: 'Uptime',
    value: '99.9%',
    trend: 0,
    icon: <Activity className="h-6 w-6" />,
  },
};

export const Dashboard: Story = {
  render: () => (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="Total Users"
        value="12,345"
        trend={12.5}
        icon={<Users className="h-6 w-6" />}
      />
      <StatCard
        label="Revenue"
        value="$45,231"
        trend={8.3}
        icon={<DollarSign className="h-6 w-6" />}
      />
      <StatCard
        label="Page Views"
        value="98,765"
        trend={-2.1}
        icon={<BarChart3 className="h-6 w-6" />}
      />
      <StatCard label="Uptime" value="99.9%" trend={0} icon={<Activity className="h-6 w-6" />} />
    </div>
  ),
};
