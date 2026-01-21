import type { Meta, StoryObj } from '@storybook/react-vite';
import { Toast, ToastProvider, ToastViewport, ToastTitle, ToastDescription, ToastClose, ToastAction } from './Toast';
import { Button } from '../Button/Button';
import * as React from 'react';

const meta: Meta<typeof Toast> = {
  title: 'Components/Toast',
  component: Toast,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <ToastProvider>
        <Story />
        <ToastViewport />
      </ToastProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof Toast>;

export const Success: Story = {
  render: () => {
    const [open, setOpen] = React.useState(false);

    return (
      <>
        <Button onClick={() => setOpen(true)}>Show Success Toast</Button>
        <Toast variant="success" open={open} onOpenChange={setOpen}>
          <div className="grid gap-1">
            <ToastTitle>Success!</ToastTitle>
            <ToastDescription>Your changes have been saved.</ToastDescription>
          </div>
          <ToastClose />
        </Toast>
      </>
    );
  },
};

export const Error: Story = {
  render: () => {
    const [open, setOpen] = React.useState(false);

    return (
      <>
        <Button variant="danger" onClick={() => setOpen(true)}>
          Show Error Toast
        </Button>
        <Toast variant="error" open={open} onOpenChange={setOpen}>
          <div className="grid gap-1">
            <ToastTitle>Error</ToastTitle>
            <ToastDescription>Something went wrong. Please try again.</ToastDescription>
          </div>
          <ToastClose />
        </Toast>
      </>
    );
  },
};

export const Warning: Story = {
  render: () => {
    const [open, setOpen] = React.useState(false);

    return (
      <>
        <Button onClick={() => setOpen(true)}>Show Warning Toast</Button>
        <Toast variant="warning" open={open} onOpenChange={setOpen}>
          <div className="grid gap-1">
            <ToastTitle>Warning</ToastTitle>
            <ToastDescription>Your session will expire in 5 minutes.</ToastDescription>
          </div>
          <ToastClose />
        </Toast>
      </>
    );
  },
};

export const Info: Story = {
  render: () => {
    const [open, setOpen] = React.useState(false);

    return (
      <>
        <Button variant="secondary" onClick={() => setOpen(true)}>
          Show Info Toast
        </Button>
        <Toast variant="info" open={open} onOpenChange={setOpen}>
          <div className="grid gap-1">
            <ToastTitle>Info</ToastTitle>
            <ToastDescription>New features are now available.</ToastDescription>
          </div>
          <ToastClose />
        </Toast>
      </>
    );
  },
};

export const WithAction: Story = {
  render: () => {
    const [open, setOpen] = React.useState(false);

    return (
      <>
        <Button onClick={() => setOpen(true)}>Show Toast with Action</Button>
        <Toast open={open} onOpenChange={setOpen}>
          <div className="grid gap-1">
            <ToastTitle>Update Available</ToastTitle>
            <ToastDescription>A new version is available.</ToastDescription>
          </div>
          <ToastAction altText="Update now" onClick={() => alert('Updating...')}>
            Update
          </ToastAction>
          <ToastClose />
        </Toast>
      </>
    );
  },
};
