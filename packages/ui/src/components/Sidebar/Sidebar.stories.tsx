import type { Meta, StoryObj } from '@storybook/react-vite';
import { Sidebar, SidebarSection, SidebarItem, SidebarDivider } from './Sidebar';
import {
  LayoutDashboard,
  Users,
  DollarSign,
  Ticket,
  Settings,
  Building,
  UserCog,
} from 'lucide-react';
import * as React from 'react';

const meta: Meta<typeof Sidebar> = {
  title: 'Layout/Sidebar',
  component: Sidebar,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
};

export default meta;
type Story = StoryObj<typeof Sidebar>;

export const Default: Story = {
  render: () => {
    const [collapsed, setCollapsed] = React.useState(false);

    return (
      <Sidebar collapsed={collapsed} onCollapsedChange={setCollapsed}>
        <SidebarSection>
          <SidebarItem icon={<LayoutDashboard className="h-5 w-5" />} active collapsed={collapsed}>
            Dashboard
          </SidebarItem>
        </SidebarSection>

        <SidebarSection title="Applications">
          <SidebarItem icon={<Users className="h-5 w-5" />} collapsed={collapsed}>
            CRM
          </SidebarItem>
          <SidebarItem icon={<DollarSign className="h-5 w-5" />} collapsed={collapsed} badge={3}>
            Billing
          </SidebarItem>
          <SidebarItem icon={<Ticket className="h-5 w-5" />} collapsed={collapsed} badge={12}>
            Help Desk
          </SidebarItem>
        </SidebarSection>

        <SidebarDivider />

        <SidebarSection>
          <SidebarItem icon={<Settings className="h-5 w-5" />} collapsed={collapsed}>
            Settings
          </SidebarItem>
          <SidebarItem icon={<Building className="h-5 w-5" />} collapsed={collapsed}>
            Workspace
          </SidebarItem>
          <SidebarItem icon={<UserCog className="h-5 w-5" />} collapsed={collapsed}>
            Users & Teams
          </SidebarItem>
        </SidebarSection>
      </Sidebar>
    );
  },
};

export const Expanded: Story = {
  render: () => (
    <Sidebar>
      <SidebarSection>
        <SidebarItem icon={<LayoutDashboard className="h-5 w-5" />} active>
          Dashboard
        </SidebarItem>
      </SidebarSection>

      <SidebarSection title="Applications">
        <SidebarItem icon={<Users className="h-5 w-5" />}>CRM</SidebarItem>
        <SidebarItem icon={<DollarSign className="h-5 w-5" />} badge={3}>
          Billing
        </SidebarItem>
        <SidebarItem icon={<Ticket className="h-5 w-5" />} badge={12}>
          Help Desk
        </SidebarItem>
      </SidebarSection>

      <SidebarDivider />

      <SidebarSection>
        <SidebarItem icon={<Settings className="h-5 w-5" />}>Settings</SidebarItem>
        <SidebarItem icon={<Building className="h-5 w-5" />}>Workspace</SidebarItem>
        <SidebarItem icon={<UserCog className="h-5 w-5" />}>Users & Teams</SidebarItem>
      </SidebarSection>
    </Sidebar>
  ),
};

export const Collapsed: Story = {
  render: () => (
    <Sidebar collapsed>
      <SidebarSection>
        <SidebarItem icon={<LayoutDashboard className="h-5 w-5" />} active collapsed>
          Dashboard
        </SidebarItem>
      </SidebarSection>

      <SidebarSection>
        <SidebarItem icon={<Users className="h-5 w-5" />} collapsed>
          CRM
        </SidebarItem>
        <SidebarItem icon={<DollarSign className="h-5 w-5" />} collapsed badge={3}>
          Billing
        </SidebarItem>
        <SidebarItem icon={<Ticket className="h-5 w-5" />} collapsed badge={12}>
          Help Desk
        </SidebarItem>
      </SidebarSection>

      <SidebarDivider />

      <SidebarSection>
        <SidebarItem icon={<Settings className="h-5 w-5" />} collapsed>
          Settings
        </SidebarItem>
      </SidebarSection>
    </Sidebar>
  ),
};
