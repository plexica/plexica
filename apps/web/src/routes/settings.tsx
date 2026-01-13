// apps/web/src/routes/settings.tsx

import { createFileRoute } from '@tanstack/react-router';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { AppLayout } from '../components/Layout';
import { useAuthStore } from '../stores/auth-store';
import { useState } from 'react';

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
});

type SettingsTab = 'general' | 'security' | 'billing' | 'integrations' | 'advanced';

function SettingsPage() {
  const { tenant } = useAuthStore();
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');

  return (
    <ProtectedRoute>
      <AppLayout>
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Workspace Settings</h1>
          <p className="text-muted-foreground">
            Manage your workspace preferences and configuration
          </p>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 mb-6 border-b border-border">
          <TabButton
            label="General"
            icon="⚙️"
            active={activeTab === 'general'}
            onClick={() => setActiveTab('general')}
          />
          <TabButton
            label="Security"
            icon="🔒"
            active={activeTab === 'security'}
            onClick={() => setActiveTab('security')}
          />
          <TabButton
            label="Billing"
            icon="💳"
            active={activeTab === 'billing'}
            onClick={() => setActiveTab('billing')}
          />
          <TabButton
            label="Integrations"
            icon="🔗"
            active={activeTab === 'integrations'}
            onClick={() => setActiveTab('integrations')}
          />
          <TabButton
            label="Advanced"
            icon="🔧"
            active={activeTab === 'advanced'}
            onClick={() => setActiveTab('advanced')}
          />
        </div>

        {/* Tab Content */}
        <div className="max-w-4xl">
          {activeTab === 'general' && <GeneralSettings tenant={tenant} />}
          {activeTab === 'security' && <SecuritySettings tenant={tenant} />}
          {activeTab === 'billing' && <BillingSettings tenant={tenant} />}
          {activeTab === 'integrations' && <IntegrationsSettings tenant={tenant} />}
          {activeTab === 'advanced' && <AdvancedSettings tenant={tenant} />}
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
}

// Tab Button Component
function TabButton({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
        active
          ? 'border-primary text-primary font-medium'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      }`}
    >
      <span>{icon}</span>
      <span className="text-sm">{label}</span>
    </button>
  );
}

// General Settings Tab
function GeneralSettings({ tenant }: { tenant: any }) {
  const [workspaceName, setWorkspaceName] = useState(tenant?.name || '');
  const [workspaceSlug, setWorkspaceSlug] = useState(tenant?.slug || '');

  const handleSave = () => {
    // TODO: Implement API call to update workspace
    alert('Workspace settings saved!');
  };

  return (
    <div className="space-y-6">
      {/* Workspace Information */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">Workspace Information</h2>
        <div className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-foreground mb-2">
              Workspace Name
            </label>
            <input
              type="text"
              id="name"
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              className="w-full px-4 py-2 bg-muted border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label htmlFor="slug" className="block text-sm font-medium text-foreground mb-2">
              Workspace Slug
            </label>
            <input
              type="text"
              id="slug"
              value={workspaceSlug}
              onChange={(e) => setWorkspaceSlug(e.target.value)}
              className="w-full px-4 py-2 bg-muted border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <p className="text-xs text-muted-foreground mt-1">
              This is used in your workspace URL: plexica.app/{workspaceSlug}
            </p>
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-foreground mb-2">
              Description (Optional)
            </label>
            <textarea
              id="description"
              rows={3}
              placeholder="A brief description of your workspace..."
              className="w-full px-4 py-2 bg-muted border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-border">
          <button
            onClick={handleSave}
            className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors font-medium"
          >
            Save Changes
          </button>
        </div>
      </div>

      {/* Workspace Preferences */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">Preferences</h2>
        <div className="space-y-4">
          <ToggleSetting
            label="Allow plugin installation"
            description="Members can browse and install plugins from the marketplace"
            defaultChecked={true}
          />
          <ToggleSetting
            label="Require approval for plugin installation"
            description="Admins must approve plugin installations"
            defaultChecked={false}
          />
          <ToggleSetting
            label="Email notifications"
            description="Send email notifications for important workspace events"
            defaultChecked={true}
          />
        </div>
      </div>
    </div>
  );
}

// Security Settings Tab
function SecuritySettings({ tenant }: { tenant: any }) {
  return (
    <div className="space-y-6">
      {/* Authentication */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">Authentication</h2>
        <div className="space-y-4">
          <ToggleSetting
            label="Require two-factor authentication"
            description="All workspace members must enable 2FA"
            defaultChecked={false}
          />
          <ToggleSetting
            label="Enforce strong passwords"
            description="Require passwords with minimum 12 characters"
            defaultChecked={true}
          />
          <ToggleSetting
            label="Session timeout"
            description="Automatically log out users after 8 hours of inactivity"
            defaultChecked={true}
          />
        </div>
      </div>

      {/* Access Control */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">Access Control</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Allowed email domains
            </label>
            <input
              type="text"
              placeholder="example.com, company.org"
              className="w-full px-4 py-2 bg-muted border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Only users with these email domains can join (comma-separated)
            </p>
          </div>
          <ToggleSetting
            label="Restrict workspace access by IP"
            description="Only allow access from whitelisted IP addresses"
            defaultChecked={false}
          />
        </div>
      </div>

      {/* API Keys */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">API Keys</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Manage API keys for programmatic access to your workspace
        </p>
        <button className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors font-medium text-sm">
          Generate New API Key
        </button>
      </div>
    </div>
  );
}

// Billing Settings Tab
function BillingSettings({ tenant }: { tenant: any }) {
  return (
    <div className="space-y-6">
      {/* Current Plan */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">Current Plan</h2>
        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="text-2xl font-bold text-foreground mb-2">Enterprise</p>
            <p className="text-sm text-muted-foreground">Billed annually</p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold text-foreground">$99</p>
            <p className="text-sm text-muted-foreground">/month</p>
          </div>
        </div>
        <div className="space-y-2 mb-6">
          <PlanFeature text="Unlimited plugins" />
          <PlanFeature text="50 team members" />
          <PlanFeature text="Priority support" />
          <PlanFeature text="Custom integrations" />
          <PlanFeature text="Advanced analytics" />
        </div>
        <button className="w-full px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors font-medium">
          Upgrade Plan
        </button>
      </div>

      {/* Usage Stats */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">Usage</h2>
        <div className="space-y-4">
          <UsageMeter label="Team Members" current={12} max={50} />
          <UsageMeter label="Storage" current={2.4} max={10} unit="GB" />
          <UsageMeter label="API Calls" current={1247} max={10000} suffix="/mo" />
        </div>
      </div>

      {/* Payment Method */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">Payment Method</h2>
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-8 bg-gradient-to-r from-blue-600 to-blue-400 rounded flex items-center justify-center text-white text-xs font-bold">
            VISA
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">•••• •••• •••• 4242</p>
            <p className="text-xs text-muted-foreground">Expires 12/2026</p>
          </div>
        </div>
        <button className="text-sm text-blue-600 hover:text-blue-800 font-medium">
          Update Payment Method
        </button>
      </div>

      {/* Billing History */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">Billing History</h2>
        <div className="space-y-3">
          <BillingItem date="Jan 1, 2025" amount="$99.00" status="Paid" />
          <BillingItem date="Dec 1, 2024" amount="$99.00" status="Paid" />
          <BillingItem date="Nov 1, 2024" amount="$99.00" status="Paid" />
        </div>
      </div>
    </div>
  );
}

// Integrations Settings Tab
function IntegrationsSettings({ tenant }: { tenant: any }) {
  const integrations = [
    {
      name: 'Slack',
      icon: '💬',
      description: 'Send notifications to Slack channels',
      connected: true,
    },
    {
      name: 'GitHub',
      icon: '🐙',
      description: 'Connect your GitHub repositories',
      connected: false,
    },
    {
      name: 'Google Workspace',
      icon: '📧',
      description: 'Sync with Google Calendar and Gmail',
      connected: true,
    },
    {
      name: 'Zapier',
      icon: '⚡',
      description: 'Automate workflows with 5000+ apps',
      connected: false,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">Available Integrations</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Connect your workspace with external services
        </p>

        <div className="grid md:grid-cols-2 gap-4">
          {integrations.map((integration) => (
            <div
              key={integration.name}
              className="border border-border rounded-lg p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start gap-3 mb-3">
                <div className="text-3xl">{integration.icon}</div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-foreground mb-1">{integration.name}</h3>
                  <p className="text-xs text-muted-foreground">{integration.description}</p>
                </div>
              </div>
              {integration.connected ? (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-green-600 font-medium">✓ Connected</span>
                  <button className="text-xs text-red-600 hover:text-red-800 font-medium">
                    Disconnect
                  </button>
                </div>
              ) : (
                <button className="w-full px-3 py-1.5 bg-primary text-white rounded text-xs font-medium hover:bg-primary/90 transition-colors">
                  Connect
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Webhooks */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">Webhooks</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Configure webhooks to receive real-time events
        </p>
        <button className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors font-medium text-sm">
          Add Webhook
        </button>
      </div>
    </div>
  );
}

// Advanced Settings Tab
function AdvancedSettings({ tenant }: { tenant: any }) {
  return (
    <div className="space-y-6">
      {/* Data Export */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">Data Export</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Export all your workspace data in JSON format
        </p>
        <button className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors font-medium text-sm">
          Export Data
        </button>
      </div>

      {/* Danger Zone */}
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-red-800 mb-4">Danger Zone</h2>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-red-800">Transfer Ownership</p>
              <p className="text-xs text-red-700">Transfer workspace to another admin</p>
            </div>
            <button className="px-4 py-2 bg-white border border-red-300 text-red-700 rounded-lg hover:bg-red-50 transition-colors font-medium text-sm">
              Transfer
            </button>
          </div>

          <div className="border-t border-red-200 pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-red-800">Delete Workspace</p>
                <p className="text-xs text-red-700">
                  Permanently delete this workspace and all data
                </p>
              </div>
              <button className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium text-sm">
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Developer Options */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">Developer Options</h2>
        <div className="space-y-4">
          <ToggleSetting
            label="Enable debug mode"
            description="Show detailed error messages and logs"
            defaultChecked={false}
          />
          <ToggleSetting
            label="API rate limit bypass"
            description="Remove API rate limits for this workspace"
            defaultChecked={false}
          />
        </div>
      </div>
    </div>
  );
}

// Helper Components
function ToggleSetting({
  label,
  description,
  defaultChecked,
}: {
  label: string;
  description: string;
  defaultChecked: boolean;
}) {
  const [checked, setChecked] = useState(defaultChecked);

  return (
    <div className="flex items-start justify-between">
      <div className="flex-1">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </div>
      <button
        onClick={() => setChecked(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          checked ? 'bg-primary' : 'bg-muted'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}

function PlanFeature({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-green-600">✓</span>
      <span className="text-sm text-foreground">{text}</span>
    </div>
  );
}

function UsageMeter({
  label,
  current,
  max,
  unit = '',
  suffix = '',
}: {
  label: string;
  current: number;
  max: number;
  unit?: string;
  suffix?: string;
}) {
  const percentage = (current / max) * 100;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-foreground">{label}</span>
        <span className="text-sm text-muted-foreground">
          {current}
          {unit} / {max}
          {unit}
          {suffix}
        </span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            percentage > 80 ? 'bg-red-600' : percentage > 60 ? 'bg-orange-600' : 'bg-primary'
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function BillingItem({ date, amount, status }: { date: string; amount: string; status: string }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
      <div>
        <p className="text-sm font-medium text-foreground">{date}</p>
        <p className="text-xs text-muted-foreground">{status}</p>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold text-foreground">{amount}</span>
        <button className="text-xs text-blue-600 hover:text-blue-800 font-medium">Download</button>
      </div>
    </div>
  );
}
