import type { Meta, StoryObj } from '@storybook/react-vite';
import { Switch } from './Switch';
import { Label } from '../Label/Label';

const meta: Meta<typeof Switch> = {
  title: 'Components/Switch',
  component: Switch,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Switch>;

export const Default: Story = {
  render: () => <Switch />,
};

export const WithLabel: Story = {
  render: () => (
    <div className="flex items-center space-x-2">
      <Switch id="airplane-mode" />
      <Label htmlFor="airplane-mode">Airplane Mode</Label>
    </div>
  ),
};

export const Checked: Story = {
  render: () => <Switch defaultChecked />,
};

export const Disabled: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex items-center space-x-2">
        <Switch disabled />
        <Label className="text-text-secondary">Disabled off</Label>
      </div>
      <div className="flex items-center space-x-2">
        <Switch disabled checked />
        <Label className="text-text-secondary">Disabled on</Label>
      </div>
    </div>
  ),
};

export const Settings: Story = {
  render: () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label htmlFor="notifications">Notifications</Label>
          <p className="text-sm text-text-secondary">Receive email notifications</p>
        </div>
        <Switch id="notifications" defaultChecked />
      </div>
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label htmlFor="marketing">Marketing emails</Label>
          <p className="text-sm text-text-secondary">Receive marketing and promotional emails</p>
        </div>
        <Switch id="marketing" />
      </div>
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label htmlFor="security">Security alerts</Label>
          <p className="text-sm text-text-secondary">Get notified about security updates</p>
        </div>
        <Switch id="security" defaultChecked />
      </div>
    </div>
  ),
};

export const WorkspaceSettings: Story = {
  render: () => (
    <div className="max-w-md space-y-4">
      <h3 className="font-semibold">Workspace Settings</h3>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="auto-assign">Auto-assign leads</Label>
            <p className="text-sm text-text-secondary">Automatically assign new leads to team members</p>
          </div>
          <Switch id="auto-assign" defaultChecked />
        </div>
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="public-workspace">Public workspace</Label>
            <p className="text-sm text-text-secondary">Allow workspace to be discoverable</p>
          </div>
          <Switch id="public-workspace" />
        </div>
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="activity-log">Activity logging</Label>
            <p className="text-sm text-text-secondary">Track all workspace activities</p>
          </div>
          <Switch id="activity-log" defaultChecked />
        </div>
      </div>
    </div>
  ),
};

export const PluginSettings: Story = {
  render: () => (
    <div className="max-w-md space-y-4">
      <h3 className="font-semibold">CRM Plugin Settings</h3>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="crm-enabled">Enable CRM</Label>
          <Switch id="crm-enabled" defaultChecked />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="email-sync">Email sync</Label>
          <Switch id="email-sync" defaultChecked />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="calendar-integration">Calendar integration</Label>
          <Switch id="calendar-integration" />
        </div>
      </div>
    </div>
  ),
};
