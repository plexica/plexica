import type { Meta, StoryObj } from '@storybook/react-vite';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './Tabs';

const meta: Meta<typeof Tabs> = {
  title: 'Components/Tabs',
  component: Tabs,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Tabs>;

export const Default: Story = {
  render: () => (
    <Tabs defaultValue="overview" className="w-[400px]">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="activity">Activity</TabsTrigger>
        <TabsTrigger value="files">Files</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">
        <div className="p-4 border rounded-md">
          <h3 className="text-lg font-semibold mb-2">Overview</h3>
          <p>This is the overview content.</p>
        </div>
      </TabsContent>
      <TabsContent value="activity">
        <div className="p-4 border rounded-md">
          <h3 className="text-lg font-semibold mb-2">Activity</h3>
          <p>Recent activity will be shown here.</p>
        </div>
      </TabsContent>
      <TabsContent value="files">
        <div className="p-4 border rounded-md">
          <h3 className="text-lg font-semibold mb-2">Files</h3>
          <p>File list will be displayed here.</p>
        </div>
      </TabsContent>
    </Tabs>
  ),
};

export const ContactDetailTabs: Story = {
  render: () => (
    <Tabs defaultValue="overview" className="w-full">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="invoices">Invoices</TabsTrigger>
        <TabsTrigger value="tickets">Tickets</TabsTrigger>
        <TabsTrigger value="activity">Activity</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">
        <div className="p-6">
          <h3 className="text-lg font-semibold mb-4">Contact Information</h3>
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <span className="text-text-secondary">Name:</span>
              <span>John Doe</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <span className="text-text-secondary">Email:</span>
              <span>john@example.com</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <span className="text-text-secondary">Phone:</span>
              <span>+1 234 567 8900</span>
            </div>
          </div>
        </div>
      </TabsContent>
      <TabsContent value="invoices">
        <div className="p-6">
          <h3 className="text-lg font-semibold mb-4">Related Invoices</h3>
          <p className="text-text-secondary">Invoice list from billing plugin...</p>
        </div>
      </TabsContent>
      <TabsContent value="tickets">
        <div className="p-6">
          <h3 className="text-lg font-semibold mb-4">Support Tickets</h3>
          <p className="text-text-secondary">Tickets from help desk plugin...</p>
        </div>
      </TabsContent>
      <TabsContent value="activity">
        <div className="p-6">
          <h3 className="text-lg font-semibold mb-4">Activity Timeline</h3>
          <p className="text-text-secondary">Activity history...</p>
        </div>
      </TabsContent>
    </Tabs>
  ),
};
