import type { Meta, StoryObj } from '@storybook/react';

import { Input } from '../components/input.js';

const meta: Meta<typeof Input> = {
  title: 'Components/Input',
  component: Input,
  tags: ['autodocs'],
};
export default meta;

type Story = StoryObj<typeof Input>;

export const Default: Story = { args: { label: 'Email', placeholder: 'you@example.com', type: 'email' } };
export const Password: Story = { args: { label: 'Password', type: 'password', placeholder: '••••••••' } };
export const WithError: Story = { args: { label: 'Email', type: 'email', value: 'invalid', error: 'Please enter a valid email address.' } };
export const WithHelper: Story = { args: { label: 'Username', helperText: 'Lowercase letters and numbers only.' } };
export const Disabled: Story = { args: { label: 'Email', type: 'email', value: 'locked@example.com', disabled: true } };
