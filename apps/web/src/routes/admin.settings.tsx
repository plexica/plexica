// File: apps/web/src/routes/admin.settings.tsx
//
// T008-56 — Tenant Admin Settings screen.
// Allows updating tenant theme (primary color, accent color, logo URL)
// and preferences (locale, timezone, date format).
// Spec 008 Admin Interfaces — Tenant Admin Phase 7

import { useEffect, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Skeleton,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
} from '@plexica/ui';
import { getTenantSettings, updateTenantSettings } from '@/api/admin';
import type { TenantSettings } from '@/api/admin';

export const Route = createFileRoute('/admin/settings' as never)({
  component: TenantAdminSettingsPage,
});

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

function useTenantSettings() {
  return useQuery({
    queryKey: ['tenant-admin', 'settings'],
    queryFn: getTenantSettings,
    staleTime: 60_000,
  });
}

function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateTenantSettings,
    onSuccess: (data) => {
      qc.setQueryData(['tenant-admin', 'settings'], data);
    },
  });
}

// ---------------------------------------------------------------------------
// Locale options (common IETF BCP 47 tags)
// ---------------------------------------------------------------------------

const LOCALE_OPTIONS = [
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'de-DE', label: 'German' },
  { value: 'fr-FR', label: 'French' },
  { value: 'es-ES', label: 'Spanish' },
  { value: 'ja-JP', label: 'Japanese' },
  { value: 'zh-CN', label: 'Chinese (Simplified)' },
];

const TIMEZONE_OPTIONS = [
  { value: 'UTC', label: 'UTC' },
  { value: 'America/New_York', label: 'Eastern (US)' },
  { value: 'America/Chicago', label: 'Central (US)' },
  { value: 'America/Denver', label: 'Mountain (US)' },
  { value: 'America/Los_Angeles', label: 'Pacific (US)' },
  { value: 'Europe/London', label: 'London' },
  { value: 'Europe/Berlin', label: 'Berlin' },
  { value: 'Asia/Tokyo', label: 'Tokyo' },
  { value: 'Australia/Sydney', label: 'Sydney' },
];

const DATE_FORMAT_OPTIONS = [
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY (US)' },
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY (EU)' },
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD (ISO)' },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function TenantAdminSettingsPage() {
  const { data: settings, isLoading, error } = useTenantSettings();
  const update = useUpdateSettings();

  // Theme state
  const [primaryColor, setPrimaryColor] = useState('');
  const [accentColor, setAccentColor] = useState('');
  const [logoUrl, setLogoUrl] = useState('');

  // Preferences state
  const [locale, setLocale] = useState('');
  const [timezone, setTimezone] = useState('');
  const [dateFormat, setDateFormat] = useState('');

  // Seed from loaded settings
  useEffect(() => {
    if (settings) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPrimaryColor(settings.theme.primaryColor ?? '');
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAccentColor(settings.theme.accentColor ?? '');
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLogoUrl(settings.theme.logoUrl ?? '');
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLocale(settings.preferences.defaultLocale ?? '');
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTimezone(settings.preferences.timezone ?? '');
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDateFormat(settings.preferences.dateFormat ?? '');
    }
  }, [settings]);

  const handleSave = async (section: 'theme' | 'preferences') => {
    let dto: Partial<TenantSettings> = {};
    if (section === 'theme') {
      dto = {
        theme: {
          primaryColor: primaryColor || undefined,
          accentColor: accentColor || undefined,
          logoUrl: logoUrl || undefined,
        },
      };
    } else {
      dto = {
        preferences: {
          defaultLocale: locale || undefined,
          timezone: timezone || undefined,
          dateFormat: dateFormat || undefined,
        },
      };
    }
    try {
      await update.mutateAsync(dto);
      toast.success('Settings saved');
    } catch {
      toast.error('Failed to save settings');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-destructive text-sm"
      >
        Failed to load settings. Please refresh.
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Tenant Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Customize your tenant's appearance and preferences.
        </p>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Theme */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Branding</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="primary-color">Primary colour</Label>
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  id="primary-color-picker"
                  value={primaryColor || '#000000'}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="h-9 w-9 rounded border border-input cursor-pointer p-0.5"
                  aria-label="Pick primary colour"
                />
                <Input
                  id="primary-color"
                  value={primaryColor}
                  placeholder="#000000"
                  aria-label="Primary colour hex value"
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="font-mono"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="accent-color">Accent colour</Label>
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  id="accent-color-picker"
                  value={accentColor || '#000000'}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="h-9 w-9 rounded border border-input cursor-pointer p-0.5"
                  aria-label="Pick accent colour"
                />
                <Input
                  id="accent-color"
                  value={accentColor}
                  placeholder="#000000"
                  aria-label="Accent colour hex value"
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="font-mono"
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="logo-url">Logo URL</Label>
            <Input
              id="logo-url"
              type="url"
              value={logoUrl}
              placeholder="https://cdn.example.com/logo.png"
              onChange={(e) => setLogoUrl(e.target.value)}
            />
            {logoUrl && (
              <img
                src={logoUrl}
                alt="Logo preview"
                className="mt-2 h-12 w-auto rounded border border-border object-contain"
                onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
              />
            )}
          </div>

          <Separator />

          <div className="flex justify-end">
            <Button onClick={() => void handleSave('theme')} disabled={update.isPending}>
              {update.isPending ? 'Saving…' : 'Save branding'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Preferences */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Preferences</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="locale">Default locale</Label>
            <Select value={locale} onValueChange={setLocale}>
              <SelectTrigger id="locale">
                <SelectValue placeholder="Select a locale…" />
              </SelectTrigger>
              <SelectContent>
                {LOCALE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="timezone">Timezone</Label>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger id="timezone">
                <SelectValue placeholder="Select a timezone…" />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="date-format">Date format</Label>
            <Select value={dateFormat} onValueChange={setDateFormat}>
              <SelectTrigger id="date-format">
                <SelectValue placeholder="Select a date format…" />
              </SelectTrigger>
              <SelectContent>
                {DATE_FORMAT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          <div className="flex justify-end">
            <Button onClick={() => void handleSave('preferences')} disabled={update.isPending}>
              {update.isPending ? 'Saving…' : 'Save preferences'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
