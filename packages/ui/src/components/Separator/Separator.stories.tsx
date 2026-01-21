import type { Meta, StoryObj } from '@storybook/react-vite';
import { Separator } from './Separator';

const meta: Meta<typeof Separator> = {
  title: 'Components/Separator',
  component: Separator,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Separator>;

export const Horizontal: Story = {
  render: () => (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-medium">Section 1</h4>
        <p className="text-sm text-text-secondary">Content for section 1</p>
      </div>
      <Separator />
      <div>
        <h4 className="text-sm font-medium">Section 2</h4>
        <p className="text-sm text-text-secondary">Content for section 2</p>
      </div>
    </div>
  ),
};

export const Vertical: Story = {
  render: () => (
    <div className="flex h-20 items-center space-x-4">
      <div className="flex-1">
        <h4 className="text-sm font-medium">Column 1</h4>
        <p className="text-sm text-text-secondary">Content</p>
      </div>
      <Separator orientation="vertical" />
      <div className="flex-1">
        <h4 className="text-sm font-medium">Column 2</h4>
        <p className="text-sm text-text-secondary">Content</p>
      </div>
      <Separator orientation="vertical" />
      <div className="flex-1">
        <h4 className="text-sm font-medium">Column 3</h4>
        <p className="text-sm text-text-secondary">Content</p>
      </div>
    </div>
  ),
};

export const InMenu: Story = {
  render: () => (
    <div className="w-56 space-y-1">
      <div className="px-2 py-1.5 text-sm">Profile</div>
      <div className="px-2 py-1.5 text-sm">Settings</div>
      <Separator className="my-1" />
      <div className="px-2 py-1.5 text-sm">Help</div>
      <div className="px-2 py-1.5 text-sm">Logout</div>
    </div>
  ),
};

export const WithMargin: Story = {
  render: () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Account Information</h3>
        <p className="text-sm text-text-secondary">Manage your account details</p>
      </div>
      <Separator className="my-4" />
      <div>
        <h3 className="text-lg font-semibold">Privacy Settings</h3>
        <p className="text-sm text-text-secondary">Control your privacy preferences</p>
      </div>
      <Separator className="my-4" />
      <div>
        <h3 className="text-lg font-semibold">Notifications</h3>
        <p className="text-sm text-text-secondary">Configure notification settings</p>
      </div>
    </div>
  ),
};

export const InCard: Story = {
  render: () => (
    <div className="w-96 rounded-lg border p-6">
      <div className="space-y-1">
        <h3 className="font-semibold">User Details</h3>
        <p className="text-sm text-text-secondary">View and manage user information</p>
      </div>
      <Separator className="my-4" />
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-text-secondary">Name</span>
          <span className="font-medium">John Doe</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-text-secondary">Email</span>
          <span className="font-medium">john@example.com</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-text-secondary">Role</span>
          <span className="font-medium">Admin</span>
        </div>
      </div>
    </div>
  ),
};
