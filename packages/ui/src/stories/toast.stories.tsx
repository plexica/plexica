import { ToastProvider, ToastViewport, Toast } from '../components/toast.js';

import type { Meta, StoryObj } from '@storybook/react';


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

export const Success: Story = { args: { variant: 'success', title: 'Saved!', description: 'Your changes have been saved.', open: true } };
export const Error: Story = { args: { variant: 'error', title: 'Error', description: 'Something went wrong. Please try again.', open: true } };
export const Warning: Story = { args: { variant: 'warning', title: 'Warning', description: 'Your session will expire in 5 minutes.', open: true } };
export const Info: Story = { args: { variant: 'info', title: 'Update available', description: 'A new version of the app is available.', open: true } };
