// apps/web/src/routes/settings.tsx

import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { AppLayout } from '../components/Layout';
import { useAuthStore } from '../stores/auth-store';
import { useWorkspace } from '../contexts/WorkspaceContext';
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
  const { currentWorkspace, updateWorkspace } = useWorkspace();

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
            <GeneralSettings
              tenant={tenant}
              currentWorkspace={currentWorkspace}
              updateWorkspace={updateWorkspace}
            />
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
function GeneralSettings({
  tenant,
  currentWorkspace,
  updateWorkspace,
}: {
  tenant: any;
  currentWorkspace: any;
  updateWorkspace: (
    workspaceId: string,
    data: { name?: string; description?: string }
  ) => Promise<void>;
}) {
  const { values, errors, isSubmitting, handleChange, handleSubmit } = useForm({
    initialValues: {
      workspaceName: currentWorkspace?.name || tenant?.name || '',
      workspaceSlug: currentWorkspace?.slug || tenant?.slug || '',
      description: currentWorkspace?.description || tenant?.description || '',
    },
    validationSchema: generalSettingsSchema,
    onSubmit: async (formValues) => {
      try {
        if (currentWorkspace) {
          await updateWorkspace(currentWorkspace.id, {
            name: formValues.workspaceName,
            description: formValues.description,
          });
        }
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

// Security Settings Tab
function SecuritySettings({ tenant: _tenant }: { tenant: any }) {
  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-lg p-12 text-center">
        <div className="text-4xl mb-3">🔒</div>
        <h2 className="text-xl font-semibold text-foreground mb-2">Security Settings</h2>
        <p className="text-sm text-muted-foreground mb-1">
          Two-factor authentication, password policies, access control, and API key management.
        </p>
        <p className="text-xs text-muted-foreground">
          This feature is coming soon. Security is currently managed through your identity provider
          (Keycloak).
        </p>
      </div>
    </div>
  );
}

// Billing Settings Tab
function BillingSettings({ tenant: _tenant }: { tenant: any }) {
  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-lg p-12 text-center">
        <div className="text-4xl mb-3">💳</div>
        <h2 className="text-xl font-semibold text-foreground mb-2">Billing & Subscription</h2>
        <p className="text-sm text-muted-foreground mb-1">
          Plan management, usage tracking, payment methods, and billing history.
        </p>
        <p className="text-xs text-muted-foreground">This feature is coming soon.</p>
      </div>
    </div>
  );
}

// Integrations Settings Tab
function IntegrationsSettings({ tenant: _tenant }: { tenant: any }) {
  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-lg p-12 text-center">
        <div className="text-4xl mb-3">🔗</div>
        <h2 className="text-xl font-semibold text-foreground mb-2">Integrations</h2>
        <p className="text-sm text-muted-foreground mb-1">
          Connect your workspace with external services like Slack, GitHub, Google Workspace, and
          more.
        </p>
        <p className="text-xs text-muted-foreground">This feature is coming soon.</p>
      </div>
    </div>
  );
}

// Advanced Settings Tab
function AdvancedSettings({ tenant: _tenant }: { tenant: any }) {
  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-lg p-12 text-center">
        <div className="text-4xl mb-3">🔧</div>
        <h2 className="text-xl font-semibold text-foreground mb-2">Advanced Settings</h2>
        <p className="text-sm text-muted-foreground mb-1">
          Data export, workspace transfer, debug mode, and developer options.
        </p>
        <p className="text-xs text-muted-foreground">This feature is coming soon.</p>
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
