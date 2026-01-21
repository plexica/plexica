// apps/web/src/routes/settings.tsx

import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { AppLayout } from '../components/Layout';
import { useAuthStore } from '../stores/auth-store';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@plexica/ui';
import { Switch } from '@plexica/ui';
import { Input } from '@plexica/ui';
import { Label } from '@plexica/ui';
import { Textarea } from '@plexica/ui';
import { Button } from '@plexica/ui';
import { Alert, AlertDescription } from '@plexica/ui';
import { AlertCircle } from 'lucide-react';
import { useForm } from '@/hooks/useForm';
import { toast } from '@/components/ToastProvider';
import { z } from 'zod';

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
});

function SettingsPage() {
  const { tenant } = useAuthStore();

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
        <Tabs defaultValue="general" className="max-w-4xl">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="general">⚙️ General</TabsTrigger>
            <TabsTrigger value="security">🔒 Security</TabsTrigger>
            <TabsTrigger value="billing">💳 Billing</TabsTrigger>
            <TabsTrigger value="integrations">🔗 Integrations</TabsTrigger>
            <TabsTrigger value="advanced">🔧 Advanced</TabsTrigger>
          </TabsList>

          {/* Tab Content */}
          <TabsContent value="general" className="mt-6">
            <GeneralSettings tenant={tenant} />
          </TabsContent>
          <TabsContent value="security" className="mt-6">
            <SecuritySettings tenant={tenant} />
          </TabsContent>
          <TabsContent value="billing" className="mt-6">
            <BillingSettings tenant={tenant} />
          </TabsContent>
          <TabsContent value="integrations" className="mt-6">
            <IntegrationsSettings tenant={tenant} />
          </TabsContent>
          <TabsContent value="advanced" className="mt-6">
            <AdvancedSettings tenant={tenant} />
          </TabsContent>
        </Tabs>
      </AppLayout>
    </ProtectedRoute>
  );
}

// Validation schema for General Settings
const generalSettingsSchema = z.object({
  workspaceName: z
    .string()
    .min(1, 'Workspace name is required')
    .max(100, 'Name must be 100 characters or less'),
  workspaceSlug: z
    .string()
    .min(1, 'Workspace slug is required')
    .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens'),
  description: z.string().max(500, 'Description must be 500 characters or less').optional(),
});

// General Settings Tab
function GeneralSettings({ tenant }: { tenant: any }) {
  const { values, errors, isSubmitting, handleChange, handleSubmit } = useForm({
    initialValues: {
      workspaceName: tenant?.name || '',
      workspaceSlug: tenant?.slug || '',
      description: tenant?.description || '',
    },
    validationSchema: generalSettingsSchema,
    onSubmit: async (_formValues) => {
      try {
        // TODO: Implement API call to update workspace
        // await apiClient.updateWorkspace(tenant.id, {
        //   name: formValues.workspaceName,
        //   slug: formValues.workspaceSlug,
        //   description: formValues.description,
        // });

        // Simulate delay
        await new Promise((resolve) => setTimeout(resolve, 500));

        toast.success('Workspace settings saved successfully!');
      } catch (error: any) {
        toast.error(error.message || 'Failed to save workspace settings');
      }
    },
  });

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Workspace Information */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">Workspace Information</h2>
        <div className="space-y-4">
          <div>
            <Label htmlFor="workspaceName">Workspace Name</Label>
            <Input
              type="text"
              id="workspaceName"
              name="workspaceName"
              value={values.workspaceName}
              onChange={handleChange}
              disabled={isSubmitting}
              className="mt-2"
            />
            {errors.workspaceName && (
              <Alert variant="destructive" className="mt-2 py-2">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-sm">{errors.workspaceName}</AlertDescription>
              </Alert>
            )}
          </div>

          <div>
            <Label htmlFor="workspaceSlug">Workspace Slug</Label>
            <Input
              type="text"
              id="workspaceSlug"
              name="workspaceSlug"
              value={values.workspaceSlug}
              onChange={handleChange}
              disabled={isSubmitting}
              className="mt-2"
            />
            {errors.workspaceSlug ? (
              <Alert variant="destructive" className="mt-2 py-2">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-sm">{errors.workspaceSlug}</AlertDescription>
              </Alert>
            ) : (
              <p className="text-xs text-muted-foreground mt-1">
                This is used in your workspace URL: plexica.app/{values.workspaceSlug}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="description">Description (Optional)</Label>
            <Textarea
              id="description"
              name="description"
              value={values.description || ''}
              onChange={handleChange}
              placeholder="A brief description of your workspace..."
              disabled={isSubmitting}
              rows={3}
              className="mt-2"
            />
            {errors.description && (
              <Alert variant="destructive" className="mt-2 py-2">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-sm">{errors.description}</AlertDescription>
              </Alert>
            )}
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-border">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : 'Save Changes'}
          </Button>
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
    </form>
  );
}

// Validation schema for Security Settings
const securitySettingsSchema = z.object({
  twoFactorAuth: z.boolean(),
  strongPasswords: z.boolean(),
  sessionTimeout: z.boolean(),
  emailDomains: z.string().optional(),
  ipRestriction: z.boolean(),
});

// Security Settings Tab
function SecuritySettings({ tenant: _tenant }: { tenant: any }) {
  const { values, errors, isSubmitting, handleChange, handleSubmit } = useForm({
    initialValues: {
      twoFactorAuth: false,
      strongPasswords: true,
      sessionTimeout: true,
      emailDomains: '',
      ipRestriction: false,
    },
    validationSchema: securitySettingsSchema,
    onSubmit: async (_formValues) => {
      try {
        // TODO: Implement API call to update security settings
        // await apiClient.updateSecuritySettings(tenant.id, formValues);

        // Simulate delay
        await new Promise((resolve) => setTimeout(resolve, 500));

        toast.success('Security settings saved successfully!');
      } catch (error: any) {
        toast.error(error.message || 'Failed to save security settings');
      }
    },
  });

  const handleToggle = (fieldName: string, value: boolean) => {
    handleChange({ target: { name: fieldName, value } } as any);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Authentication */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">Authentication</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">
                Require two-factor authentication
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                All workspace members must enable 2FA
              </p>
            </div>
            <Switch
              checked={values.twoFactorAuth}
              onCheckedChange={(val) => handleToggle('twoFactorAuth', val)}
              disabled={isSubmitting}
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">Enforce strong passwords</p>
              <p className="text-xs text-muted-foreground mt-1">
                Require passwords with minimum 12 characters
              </p>
            </div>
            <Switch
              checked={values.strongPasswords}
              onCheckedChange={(val) => handleToggle('strongPasswords', val)}
              disabled={isSubmitting}
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">Session timeout</p>
              <p className="text-xs text-muted-foreground mt-1">
                Automatically log out users after 8 hours of inactivity
              </p>
            </div>
            <Switch
              checked={values.sessionTimeout}
              onCheckedChange={(val) => handleToggle('sessionTimeout', val)}
              disabled={isSubmitting}
            />
          </div>
        </div>
      </div>

      {/* Access Control */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">Access Control</h2>
        <div className="space-y-4">
          <div>
            <Label htmlFor="emailDomains">Allowed email domains</Label>
            <Input
              id="emailDomains"
              name="emailDomains"
              type="text"
              value={values.emailDomains}
              onChange={handleChange}
              placeholder="example.com, company.org"
              disabled={isSubmitting}
              className="mt-2"
            />
            {errors.emailDomains && (
              <Alert variant="destructive" className="mt-2 py-2">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-sm">{errors.emailDomains}</AlertDescription>
              </Alert>
            )}
            {!errors.emailDomains && (
              <p className="text-xs text-muted-foreground mt-1">
                Only users with these email domains can join (comma-separated)
              </p>
            )}
          </div>
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">Restrict workspace access by IP</p>
              <p className="text-xs text-muted-foreground mt-1">
                Only allow access from whitelisted IP addresses
              </p>
            </div>
            <Switch
              checked={values.ipRestriction}
              onCheckedChange={(val) => handleToggle('ipRestriction', val)}
              disabled={isSubmitting}
            />
          </div>
        </div>
      </div>

      {/* API Keys */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">API Keys</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Manage API keys for programmatic access to your workspace
        </p>
        <Button type="button" disabled={isSubmitting}>
          Generate New API Key
        </Button>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </form>
  );
}

// Billing Settings Tab
function BillingSettings({ tenant: _tenant }: { tenant: any }) {
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
        <Button className="w-full">Upgrade Plan</Button>
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
        <Button variant="link" className="p-0">
          Update Payment Method
        </Button>
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
function IntegrationsSettings({ tenant: _tenant }: { tenant: any }) {
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
                  <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-800">
                    Disconnect
                  </Button>
                </div>
              ) : (
                <Button className="w-full" size="sm">
                  Connect
                </Button>
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
        <Button>Add Webhook</Button>
      </div>
    </div>
  );
}

// Advanced Settings Tab
function AdvancedSettings({ tenant: _tenant }: { tenant: any }) {
  return (
    <div className="space-y-6">
      {/* Data Export */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">Data Export</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Export all your workspace data in JSON format
        </p>
        <Button>Export Data</Button>
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
            <Button variant="outline">Transfer</Button>
          </div>

          <div className="border-t border-red-200 pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-red-800">Delete Workspace</p>
                <p className="text-xs text-red-700">
                  Permanently delete this workspace and all data
                </p>
              </div>
              <Button variant="destructive">Delete</Button>
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
    <div className="flex items-center justify-between">
      <div className="flex-1">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={setChecked} />
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
        <Button variant="link" size="sm">
          Download
        </Button>
      </div>
    </div>
  );
}
