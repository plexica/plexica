import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ConfirmDialog } from './ConfirmDialog';
import { Button } from '../Button/Button';

const meta: Meta<typeof ConfirmDialog> = {
  title: 'Components/ConfirmDialog',
  component: ConfirmDialog,
  tags: ['autodocs'],
};
export default meta;

type Story = StoryObj<typeof ConfirmDialog>;

export const Default: Story = {
  args: {
    title: 'Are you sure?',
    description: 'This action cannot be undone.',
    open: true,
    onConfirm: () => {},
  },
};

export const Destructive: Story = {
  args: {
    title: 'Delete Item',
    description: 'Are you sure you want to delete this item? This action cannot be undone.',
    confirmLabel: 'Delete',
    variant: 'destructive',
    open: true,
    onConfirm: () => {},
  },
};

export const CustomLabels: Story = {
  args: {
    title: 'Publish Changes',
    description: 'Your changes will be visible to all users immediately.',
    confirmLabel: 'Yes, publish',
    cancelLabel: 'Not yet',
    open: true,
    onConfirm: () => {},
  },
};

export const Loading: Story = {
  args: {
    title: 'Delete Account',
    description: 'This will permanently delete your account and all data.',
    confirmLabel: 'Deleting...',
    variant: 'destructive',
    loading: true,
    open: true,
    onConfirm: () => {},
  },
};

export const WithTrigger: Story = {
  render: () => {
    const [open, setOpen] = useState(false);
    return (
      <ConfirmDialog
        title="Delete Project"
        description="Are you sure you want to delete this project?"
        confirmLabel="Delete"
        variant="destructive"
        open={open}
        onOpenChange={setOpen}
        onConfirm={() => setOpen(false)}
        trigger={<Button variant="destructive">Delete Project</Button>}
      />
    );
  },
};
