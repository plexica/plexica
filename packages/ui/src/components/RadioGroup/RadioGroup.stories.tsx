import type { Meta, StoryObj } from '@storybook/react-vite';
import { RadioGroup, RadioGroupItem } from './RadioGroup';
import { Label } from '../Label/Label';

const meta: Meta<typeof RadioGroup> = {
  title: 'Components/RadioGroup',
  component: RadioGroup,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof RadioGroup>;

export const Default: Story = {
  render: () => (
    <RadioGroup defaultValue="option1">
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="option1" id="option1" />
        <Label htmlFor="option1">Option 1</Label>
      </div>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="option2" id="option2" />
        <Label htmlFor="option2">Option 2</Label>
      </div>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="option3" id="option3" />
        <Label htmlFor="option3">Option 3</Label>
      </div>
    </RadioGroup>
  ),
};

export const PaymentMethod: Story = {
  render: () => (
    <RadioGroup defaultValue="card">
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="card" id="card" />
        <Label htmlFor="card">Credit Card</Label>
      </div>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="paypal" id="paypal" />
        <Label htmlFor="paypal">PayPal</Label>
      </div>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="bank" id="bank" />
        <Label htmlFor="bank">Bank Transfer</Label>
      </div>
    </RadioGroup>
  ),
};

export const Permission: Story = {
  render: () => (
    <div className="space-y-3">
      <h3 className="font-semibold">Permission level:</h3>
      <RadioGroup defaultValue="readonly">
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="readonly" id="readonly" />
          <div className="flex flex-col">
            <Label htmlFor="readonly">Read-only</Label>
            <span className="text-xs text-text-secondary">Can view but not edit</span>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="edit" id="edit" />
          <div className="flex flex-col">
            <Label htmlFor="edit">Can edit</Label>
            <span className="text-xs text-text-secondary">Can view and modify</span>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="admin" id="admin" />
          <div className="flex flex-col">
            <Label htmlFor="admin">Admin</Label>
            <span className="text-xs text-text-secondary">Full access and control</span>
          </div>
        </div>
      </RadioGroup>
    </div>
  ),
};

export const Disabled: Story = {
  render: () => (
    <RadioGroup defaultValue="option1">
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="option1" id="d-option1" />
        <Label htmlFor="d-option1">Available option</Label>
      </div>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="option2" id="d-option2" disabled />
        <Label htmlFor="d-option2" className="text-text-secondary">
          Disabled option
        </Label>
      </div>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="option3" id="d-option3" />
        <Label htmlFor="d-option3">Another available option</Label>
      </div>
    </RadioGroup>
  ),
};

export const WorkspacePermission: Story = {
  render: () => (
    <div className="max-w-md space-y-4">
      <h3 className="font-semibold">Share contact with:</h3>
      <RadioGroup defaultValue="workspace">
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="workspace" id="share-workspace" />
          <div className="flex flex-col">
            <Label htmlFor="share-workspace">Current workspace only</Label>
            <span className="text-xs text-text-secondary">
              Only Sales workspace members can access
            </span>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="selected" id="share-selected" />
          <div className="flex flex-col">
            <Label htmlFor="share-selected">Selected workspaces</Label>
            <span className="text-xs text-text-secondary">
              Choose which workspaces to share with
            </span>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="all" id="share-all" />
          <div className="flex flex-col">
            <Label htmlFor="share-all">All workspaces</Label>
            <span className="text-xs text-text-secondary">Share across the entire tenant</span>
          </div>
        </div>
      </RadioGroup>
    </div>
  ),
};
