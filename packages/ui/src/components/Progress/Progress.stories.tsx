import type { Meta, StoryObj } from '@storybook/react-vite';
import { Progress } from './Progress';
import * as React from 'react';

const meta: Meta<typeof Progress> = {
  title: 'Components/Progress',
  component: Progress,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Progress>;

export const Default: Story = {
  args: {
    value: 50,
  },
};

export const Empty: Story = {
  args: {
    value: 0,
  },
};

export const Complete: Story = {
  args: {
    value: 100,
  },
};

export const WithLabel: Story = {
  render: () => {
    const value = 65;
    return (
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>Progress</span>
          <span className="text-text-secondary">{value}%</span>
        </div>
        <Progress value={value} />
      </div>
    );
  },
};

export const Different: Story = {
  render: () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>25%</span>
        </div>
        <Progress value={25} />
      </div>
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>50%</span>
        </div>
        <Progress value={50} />
      </div>
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>75%</span>
        </div>
        <Progress value={75} />
      </div>
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>100%</span>
        </div>
        <Progress value={100} />
      </div>
    </div>
  ),
};

export const Animated: Story = {
  render: () => {
    const [progress, setProgress] = React.useState(0);

    React.useEffect(() => {
      const timer = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 100) return 0;
          return prev + 10;
        });
      }, 500);

      return () => clearInterval(timer);
    }, []);

    return (
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>Uploading...</span>
          <span className="text-text-secondary">{progress}%</span>
        </div>
        <Progress value={progress} />
      </div>
    );
  },
};

export const FileUpload: Story = {
  render: () => (
    <div className="w-96 space-y-4">
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="font-medium">document.pdf</span>
          <span className="text-text-secondary">2.4 MB / 5.0 MB</span>
        </div>
        <Progress value={48} />
      </div>
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="font-medium">image.png</span>
          <span className="text-text-secondary">Complete</span>
        </div>
        <Progress value={100} />
      </div>
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="font-medium">video.mp4</span>
          <span className="text-text-secondary">0.5 MB / 50.0 MB</span>
        </div>
        <Progress value={1} />
      </div>
    </div>
  ),
};

export const TaskCompletion: Story = {
  render: () => (
    <div className="max-w-md space-y-4">
      <div>
        <h3 className="font-semibold mb-2">Onboarding Progress</h3>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>3 of 5 steps completed</span>
            <span className="text-text-secondary">60%</span>
          </div>
          <Progress value={60} />
        </div>
      </div>
      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-green-500">✓</span>
          <span>Create account</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-green-500">✓</span>
          <span>Set up workspace</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-green-500">✓</span>
          <span>Invite team members</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-text-secondary">○</span>
          <span className="text-text-secondary">Configure plugins</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-text-secondary">○</span>
          <span className="text-text-secondary">Complete profile</span>
        </div>
      </div>
    </div>
  ),
};
