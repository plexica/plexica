import type { Meta, StoryObj } from '@storybook/react-vite';
import { Checkbox } from './Checkbox';
import { Label } from '../Label/Label';

const meta: Meta<typeof Checkbox> = {
  title: 'Components/Checkbox',
  component: Checkbox,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Checkbox>;

export const Default: Story = {
  render: () => <Checkbox />,
};

export const WithLabel: Story = {
  render: () => (
    <div className="flex items-center space-x-2">
      <Checkbox id="terms" />
      <Label htmlFor="terms">Accept terms and conditions</Label>
    </div>
  ),
};

export const Checked: Story = {
  render: () => <Checkbox defaultChecked />,
};

export const Disabled: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex items-center space-x-2">
        <Checkbox disabled />
        <Label className="text-text-secondary">Disabled unchecked</Label>
      </div>
      <div className="flex items-center space-x-2">
        <Checkbox disabled checked />
        <Label className="text-text-secondary">Disabled checked</Label>
      </div>
    </div>
  ),
};

export const FormExample: Story = {
  render: () => (
    <div className="space-y-4">
      <div className="flex items-center space-x-2">
        <Checkbox id="marketing" defaultChecked />
        <Label htmlFor="marketing">Send me marketing emails</Label>
      </div>
      <div className="flex items-center space-x-2">
        <Checkbox id="notifications" />
        <Label htmlFor="notifications">Send me notifications</Label>
      </div>
      <div className="flex items-center space-x-2">
        <Checkbox id="newsletter" defaultChecked />
        <Label htmlFor="newsletter">Subscribe to newsletter</Label>
      </div>
    </div>
  ),
};

export const WorkspaceSharing: Story = {
  render: () => (
    <div className="max-w-md space-y-4">
      <h3 className="font-semibold">Share with workspace:</h3>
      <div className="space-y-3">
        <div className="flex items-center space-x-2">
          <Checkbox id="workspace-marketing" />
          <Label htmlFor="workspace-marketing">Marketing</Label>
        </div>
        <div className="flex items-center space-x-2">
          <Checkbox id="workspace-engineering" />
          <Label htmlFor="workspace-engineering">Engineering</Label>
        </div>
        <div className="flex items-center space-x-2">
          <Checkbox id="workspace-sales" defaultChecked />
          <Label htmlFor="workspace-sales">Sales (current)</Label>
        </div>
      </div>
      <div className="pt-2 border-t">
        <div className="flex items-center space-x-2">
          <Checkbox id="notify-members" defaultChecked />
          <Label htmlFor="notify-members">Notify workspace members</Label>
        </div>
      </div>
    </div>
  ),
};
