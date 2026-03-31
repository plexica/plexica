import { Button } from '../components/button.js';

import type { Meta, StoryObj } from '@storybook/react';


const meta: Meta<typeof Button> = {
  title: 'Components/Button',
  component: Button,
  tags: ['autodocs'],
};
export default meta;

type Story = StoryObj<typeof Button>;

export const Primary: Story = { args: { variant: 'primary', children: 'Button' } };
export const Secondary: Story = { args: { variant: 'secondary', children: 'Button' } };
export const Destructive: Story = { args: { variant: 'destructive', children: 'Delete' } };
export const Ghost: Story = { args: { variant: 'ghost', children: 'Button' } };
export const Outline: Story = { args: { variant: 'outline', children: 'Button' } };
export const Disabled: Story = { args: { variant: 'primary', children: 'Disabled', disabled: true } };
export const Loading: Story = { args: { variant: 'primary', children: 'Saving…', loading: true } };
export const Small: Story = { args: { variant: 'primary', children: 'Small', size: 'sm' } };
export const Large: Story = { args: { variant: 'primary', children: 'Large', size: 'lg' } };
