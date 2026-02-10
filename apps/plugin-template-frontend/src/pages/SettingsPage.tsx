// File: apps/plugin-template-frontend/src/pages/SettingsPage.tsx

import React, { useState } from 'react';
import type { PluginProps } from '@plexica/types';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Switch,
} from '@plexica/ui';
import { CheckCircle2, Save } from 'lucide-react';

// ---------------------------------------------------------------------------
// SettingsPage component
// ---------------------------------------------------------------------------

/**
 * Example settings page built entirely with `@plexica/ui` components.
 *
 * Demonstrates:
 * - `Card` with `CardHeader`, `CardContent`, `CardFooter`
 * - `Input` with `Label` and error states
 * - `Select` (Radix-based dropdown)
 * - `Switch` (toggle)
 * - `Separator` (visual divider)
 * - `Alert` (success feedback)
 * - `Button` (primary action)
 *
 * Replace the local state with real API calls in your plugin.
 */
export const SettingsPage: React.FC<PluginProps> = ({ tenantId }) => {
  const [saved, setSaved] = useState(false);
  const [pluginName, setPluginName] = useState('My Plugin');
  const [apiEndpoint, setApiEndpoint] = useState('https://api.example.com');
  const [refreshInterval, setRefreshInterval] = useState('30');
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [debugMode, setDebugMode] = useState(false);

  const handleSave = () => {
    // In a real plugin, you'd call your API here
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="space-y-6 p-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Configure your plugin for tenant <strong>{tenantId}</strong>.
        </p>
      </div>

      {/* Success alert */}
      {saved && (
        <Alert variant="success">
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>Settings saved</AlertTitle>
          <AlertDescription>
            Your plugin configuration has been updated successfully.
          </AlertDescription>
        </Alert>
      )}

      {/* General settings card */}
      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
          <CardDescription>Basic plugin configuration options.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Text input */}
          <div className="space-y-2">
            <Label htmlFor="plugin-name">Plugin Display Name</Label>
            <Input
              id="plugin-name"
              value={pluginName}
              onChange={(e) => setPluginName(e.target.value)}
              placeholder="Enter plugin name"
            />
          </div>

          {/* Input with helper text */}
          <div className="space-y-2">
            <Label htmlFor="api-endpoint">API Endpoint</Label>
            <Input
              id="api-endpoint"
              value={apiEndpoint}
              onChange={(e) => setApiEndpoint(e.target.value)}
              placeholder="https://api.example.com"
              helperText="The base URL for your plugin's backend API."
            />
          </div>

          {/* Select dropdown */}
          <div className="space-y-2">
            <Label htmlFor="refresh-interval">Data Refresh Interval</Label>
            <Select value={refreshInterval} onValueChange={setRefreshInterval}>
              <SelectTrigger>
                <SelectValue placeholder="Select interval" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">Every 10 seconds</SelectItem>
                <SelectItem value="30">Every 30 seconds</SelectItem>
                <SelectItem value="60">Every minute</SelectItem>
                <SelectItem value="300">Every 5 minutes</SelectItem>
                <SelectItem value="0">Manual only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Feature toggles card */}
      <Card>
        <CardHeader>
          <CardTitle>Features</CardTitle>
          <CardDescription>Enable or disable plugin features.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Switch toggle — notifications */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="notifications">Notifications</Label>
              <p className="text-xs text-muted-foreground">
                Receive alerts when important events occur.
              </p>
            </div>
            <Switch
              id="notifications"
              checked={notificationsEnabled}
              onCheckedChange={setNotificationsEnabled}
            />
          </div>

          <Separator />

          {/* Switch toggle — debug mode */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="debug-mode">Debug Mode</Label>
              <p className="text-xs text-muted-foreground">
                Show detailed logging in the browser console.
              </p>
            </div>
            <Switch id="debug-mode" checked={debugMode} onCheckedChange={setDebugMode} />
          </div>
        </CardContent>
        <CardFooter className="justify-end">
          <Button onClick={handleSave}>
            <Save className="mr-2 h-4 w-4" />
            Save Settings
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};
