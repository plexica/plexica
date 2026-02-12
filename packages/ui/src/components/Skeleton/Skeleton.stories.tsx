import type { Meta, StoryObj } from '@storybook/react-vite';
import { Skeleton } from './Skeleton';

const meta: Meta<typeof Skeleton> = {
  title: 'Components/Skeleton',
  component: Skeleton,
  tags: ['autodocs'],
};
export default meta;

type Story = StoryObj<typeof Skeleton>;

export const Default: Story = {
  args: {
    width: '100%',
  },
};

export const Line: Story = {
  args: {
    shape: 'line',
    width: '200px',
  },
};

export const Circle: Story = {
  args: {
    shape: 'circle',
    width: 48,
  },
};

export const Rectangle: Story = {
  args: {
    shape: 'rect',
    width: '100%',
    height: 120,
  },
};

export const TextBlock: Story = {
  render: () => (
    <div className="space-y-3">
      <Skeleton shape="line" width="80%" />
      <Skeleton shape="line" width="100%" />
      <Skeleton shape="line" width="60%" />
    </div>
  ),
};

export const CardPlaceholder: Story = {
  render: () => (
    <div className="flex items-center gap-4 p-4 border border-border rounded-lg">
      <Skeleton shape="circle" width={48} />
      <div className="flex-1 space-y-2">
        <Skeleton shape="line" width="40%" />
        <Skeleton shape="line" width="70%" />
      </div>
    </div>
  ),
};

export const CustomSize: Story = {
  args: {
    shape: 'rect',
    width: 300,
    height: 200,
  },
};
