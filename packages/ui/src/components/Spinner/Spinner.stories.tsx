import type { Meta, StoryObj } from '@storybook/react-vite';
import { Spinner, PageSpinner } from './Spinner';
import { Button } from '../Button/Button';

const meta: Meta<typeof Spinner> = {
  title: 'Components/Spinner',
  component: Spinner,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Spinner>;

export const Small: Story = {
  args: {
    size: 'sm',
  },
};

export const Medium: Story = {
  args: {
    size: 'md',
  },
};

export const Large: Story = {
  args: {
    size: 'lg',
  },
};

export const AllSizes: Story = {
  render: () => (
    <div className="flex items-center gap-8">
      <div className="text-center">
        <Spinner size="sm" />
        <p className="mt-2 text-xs text-text-secondary">Small</p>
      </div>
      <div className="text-center">
        <Spinner size="md" />
        <p className="mt-2 text-xs text-text-secondary">Medium</p>
      </div>
      <div className="text-center">
        <Spinner size="lg" />
        <p className="mt-2 text-xs text-text-secondary">Large</p>
      </div>
    </div>
  ),
};

export const InButton: Story = {
  render: () => (
    <Button disabled>
      <Spinner size="sm" className="mr-2" />
      Loading...
    </Button>
  ),
};

export const Centered: Story = {
  render: () => (
    <div className="flex h-64 items-center justify-center border rounded-md">
      <Spinner />
    </div>
  ),
};

export const FullPage: Story = {
  render: () => <PageSpinner />,
  parameters: {
    layout: 'fullscreen',
  },
};
