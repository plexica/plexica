// apps/super-admin/src/components/tenants/CreateTenantWizard.tsx
// T001-22: 4-step tenant creation wizard per ADR-016, Spec 001 design-spec Screen 2.
//
// Steps:
//   1. Basics  — name (auto-generates slug), slug (debounced availability check), admin email
//   2. Plugins — checkbox list of available plugins (skippable)
//   3. Theme   — logo URL, colors, font, custom CSS (skippable)
//   4. Review  — summary with "Edit" links; submits to API, then shows ProvisioningProgress
//
// State managed by useWizardState (useReducer + sessionStorage per ADR-016).
// Per-step validation via Zod (wizard-schemas.ts) — NO react-hook-form.

import { useState, useEffect, useCallback, useRef } from 'react';
import { StepWizard, ProvisioningProgress, ColorPicker, ThemePreview } from '@plexica/ui';
import type { WizardStep } from '@plexica/ui';
import { useWizardState } from '@/hooks/useWizardState';
import { usePlugins } from '@/hooks/usePlugins';
import { apiClient } from '@/lib/api-client';
import { basicsSchema, pluginsSchema, themeSchema } from './wizard-schemas';
import type { BasicsFormData, PluginsFormData, ThemeFormData } from './wizard-schemas';
import type { ZodError } from 'zod';

// ─── Constants ────────────────────────────────────────────────────────────────

const WIZARD_STEPS: WizardStep[] = [
  { id: 'basics', label: 'Basics', description: 'Name, slug, and admin email' },
  { id: 'plugins', label: 'Plugins', description: 'Select plugins to enable', isOptional: true },
  { id: 'theme', label: 'Theme', description: 'Customize appearance', isOptional: true },
  { id: 'review', label: 'Review', description: 'Confirm and create' },
];

const PROVISIONING_STEPS = [
  { id: 'schema_created', name: 'schema_created', label: 'Database schema' },
  { id: 'keycloak_realm', name: 'keycloak_realm', label: 'Keycloak realm' },
  { id: 'keycloak_clients', name: 'keycloak_clients', label: 'Keycloak clients' },
  { id: 'keycloak_roles', name: 'keycloak_roles', label: 'Keycloak roles' },
  { id: 'minio_bucket', name: 'minio_bucket', label: 'Object storage' },
  { id: 'admin_user', name: 'admin_user', label: 'Admin user' },
  { id: 'invitation_sent', name: 'invitation_sent', label: 'Invitation email' },
];

const SLUG_DEBOUNCE_MS = 300;
const POLL_INTERVAL_MS = 2000;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
}

function flattenZodErrors(err: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.');
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

// ─── Step 1: Basics ──────────────────────────────────────────────────────────

interface BasicsStepProps {
  initial: BasicsFormData | null;
  onValid: (data: BasicsFormData, isSlugAvailable: boolean) => void;
}

function BasicsStep({ initial, onValid }: BasicsStepProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [adminEmail, setAdminEmail] = useState(initial?.adminEmail ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [slugChecking, setSlugChecking] = useState(false);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-generate slug from name when not manually edited
  useEffect(() => {
    if (!slugManuallyEdited && name) {
      setSlug(slugify(name));
    }
  }, [name, slugManuallyEdited]);

  // Debounced slug availability check
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSlugAvailable(null);
    setSlugChecking(false);

    const slugResult = basicsSchema.shape.slug.safeParse(slug);
    if (!slug || !slugResult.success) return;

    setSlugChecking(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const result = await apiClient.checkSlugAvailability(slug);
        setSlugAvailable(result.available);
      } catch {
        setSlugAvailable(null);
      } finally {
        setSlugChecking(false);
      }
    }, SLUG_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [slug]);

  // Notify parent whenever inputs change so Next can be enabled/disabled
  useEffect(() => {
    const result = basicsSchema.safeParse({ name, slug, adminEmail });
    if (result.success && slugAvailable === true) {
      onValid(result.data, true);
    } else {
      onValid({ name, slug, adminEmail }, false);
    }
  }, [name, slug, adminEmail, slugAvailable, onValid]);

  function validate(): boolean {
    const result = basicsSchema.safeParse({ name, slug, adminEmail });
    if (!result.success) {
      setErrors(flattenZodErrors(result.error));
      return false;
    }
    if (slugAvailable === false) {
      setErrors({ slug: 'This slug is already taken' });
      return false;
    }
    if (slugAvailable === null || slugChecking) {
      setErrors({ slug: 'Checking slug availability…' });
      return false;
    }
    setErrors({});
    return true;
  }

  // Expose validate so parent can call it on Next
  (BasicsStep as { validate?: () => boolean }).validate = validate;

  return (
    <div className="space-y-5">
      {/* Name */}
      <div>
        <label htmlFor="tenant-name" className="block text-sm font-medium text-foreground mb-1">
          Tenant Name{' '}
          <span className="text-destructive" aria-hidden="true">
            *
          </span>
        </label>
        <input
          id="tenant-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Acme Corp"
          className="w-full px-3 py-2 bg-background border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          aria-required="true"
          aria-describedby={errors.name ? 'name-error' : undefined}
        />
        {errors.name && (
          <p id="name-error" role="alert" className="mt-1 text-xs text-destructive">
            {errors.name}
          </p>
        )}
      </div>

      {/* Slug */}
      <div>
        <label htmlFor="tenant-slug" className="block text-sm font-medium text-foreground mb-1">
          Slug{' '}
          <span className="text-destructive" aria-hidden="true">
            *
          </span>
        </label>
        <div className="relative">
          <input
            id="tenant-slug"
            type="text"
            value={slug}
            onChange={(e) => {
              setSlugManuallyEdited(true);
              setSlug(e.target.value.toLowerCase());
            }}
            placeholder="acme-corp"
            className="w-full px-3 py-2 bg-background border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary pr-24"
            aria-required="true"
            aria-describedby={
              errors.slug
                ? 'slug-error'
                : slugAvailable === true
                  ? 'slug-available'
                  : slugAvailable === false
                    ? 'slug-taken'
                    : undefined
            }
          />
          {/* Availability indicator */}
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs">
            {slugChecking && <span className="text-muted-foreground">Checking…</span>}
            {!slugChecking && slugAvailable === true && (
              <span id="slug-available" className="text-green-600" aria-live="polite">
                Available
              </span>
            )}
            {!slugChecking && slugAvailable === false && (
              <span id="slug-taken" className="text-destructive" aria-live="polite">
                Taken
              </span>
            )}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          3–64 characters, lowercase letters, numbers, and hyphens only
        </p>
        {errors.slug && (
          <p id="slug-error" role="alert" className="mt-1 text-xs text-destructive">
            {errors.slug}
          </p>
        )}
      </div>

      {/* Admin Email */}
      <div>
        <label htmlFor="admin-email" className="block text-sm font-medium text-foreground mb-1">
          Admin Email{' '}
          <span className="text-destructive" aria-hidden="true">
            *
          </span>
        </label>
        <input
          id="admin-email"
          type="email"
          value={adminEmail}
          onChange={(e) => setAdminEmail(e.target.value)}
          placeholder="admin@acme.com"
          className="w-full px-3 py-2 bg-background border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          aria-required="true"
          aria-describedby={errors.adminEmail ? 'email-error' : undefined}
        />
        {errors.adminEmail && (
          <p id="email-error" role="alert" className="mt-1 text-xs text-destructive">
            {errors.adminEmail}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Step 2: Plugins ─────────────────────────────────────────────────────────

interface PluginsStepProps {
  initial: PluginsFormData | null;
  onChange: (data: PluginsFormData) => void;
}

function PluginsStep({ initial, onChange }: PluginsStepProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>(initial?.pluginIds ?? []);
  const { plugins, isLoading } = usePlugins();

  useEffect(() => {
    onChange({ pluginIds: selectedIds });
  }, [selectedIds, onChange]);

  function toggle(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8" aria-live="polite">
        <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-solid border-primary border-r-transparent" />
        <span className="ml-2 text-sm text-muted-foreground">Loading plugins…</span>
      </div>
    );
  }

  if (!plugins.length) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        No plugins available. You can install plugins later from the Plugins section.
      </p>
    );
  }

  return (
    <div className="space-y-2" role="group" aria-label="Available plugins">
      {plugins.map((plugin) => {
        const checked = selectedIds.includes(plugin.id);
        return (
          <label
            key={plugin.id}
            className="flex items-start gap-3 p-3 rounded-md border border-border hover:bg-muted/30 cursor-pointer"
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => toggle(plugin.id)}
              className="mt-0.5 h-4 w-4 accent-primary"
              aria-label={plugin.name}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">{plugin.name}</p>
              <p className="text-xs text-muted-foreground truncate">
                {plugin.description ?? plugin.id}
              </p>
            </div>
          </label>
        );
      })}
    </div>
  );
}

// ─── Step 3: Theme ───────────────────────────────────────────────────────────

interface ThemeStepProps {
  initial: ThemeFormData | null;
  onChange: (data: ThemeFormData) => void;
}

function ThemeStep({ initial, onChange }: ThemeStepProps) {
  const [logoUrl, setLogoUrl] = useState(initial?.logoUrl ?? '');
  const [primaryColor, setPrimaryColor] = useState(initial?.primaryColor ?? '#6366f1');
  const [secondaryColor, setSecondaryColor] = useState(initial?.secondaryColor ?? '#8b5cf6');
  const [accentColor, setAccentColor] = useState(initial?.accentColor ?? '#ec4899');
  const [fontFamily, setFontFamily] = useState(initial?.fontFamily ?? '');
  const [customCss, setCustomCss] = useState(initial?.customCss ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const data: ThemeFormData = {
      logoUrl: logoUrl || undefined,
      primaryColor: primaryColor || undefined,
      secondaryColor: secondaryColor || undefined,
      accentColor: accentColor || undefined,
      fontFamily: fontFamily || undefined,
      customCss: customCss || undefined,
    };
    const result = themeSchema.safeParse(data);
    if (result.success) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setErrors({});
      onChange(result.data);
    } else {
      setErrors(flattenZodErrors(result.error));
      onChange(data);
    }
  }, [logoUrl, primaryColor, secondaryColor, accentColor, fontFamily, customCss, onChange]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: inputs */}
        <div className="space-y-4">
          {/* Logo URL */}
          <div>
            <label htmlFor="logo-url" className="block text-sm font-medium text-foreground mb-1">
              Logo URL
            </label>
            <input
              id="logo-url"
              type="url"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://example.com/logo.png"
              className="w-full px-3 py-2 bg-background border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm"
              aria-describedby={errors.logoUrl ? 'logo-url-error' : undefined}
            />
            {errors.logoUrl && (
              <p id="logo-url-error" role="alert" className="mt-1 text-xs text-destructive">
                {errors.logoUrl}
              </p>
            )}
          </div>

          {/* Colors */}
          <div>
            <p className="block text-sm font-medium text-foreground mb-2">Colors</p>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-24">Primary</span>
                <ColorPicker
                  value={primaryColor ?? '#6366f1'}
                  onChange={(v) => setPrimaryColor(v)}
                  aria-label="Primary color"
                />
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-24">Secondary</span>
                <ColorPicker
                  value={secondaryColor ?? '#8b5cf6'}
                  onChange={(v) => setSecondaryColor(v)}
                  aria-label="Secondary color"
                />
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-24">Accent</span>
                <ColorPicker
                  value={accentColor ?? '#ec4899'}
                  onChange={(v) => setAccentColor(v)}
                  aria-label="Accent color"
                />
              </div>
            </div>
          </div>

          {/* Font */}
          <div>
            <label htmlFor="font-family" className="block text-sm font-medium text-foreground mb-1">
              Font Family
            </label>
            <input
              id="font-family"
              type="text"
              value={fontFamily}
              onChange={(e) => setFontFamily(e.target.value)}
              placeholder="Inter, sans-serif"
              maxLength={100}
              className="w-full px-3 py-2 bg-background border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm"
              aria-describedby={errors.fontFamily ? 'font-error' : undefined}
            />
            {errors.fontFamily && (
              <p id="font-error" role="alert" className="mt-1 text-xs text-destructive">
                {errors.fontFamily}
              </p>
            )}
          </div>

          {/* Custom CSS */}
          <div>
            <label htmlFor="custom-css" className="block text-sm font-medium text-foreground mb-1">
              Custom CSS{' '}
              <span className="text-muted-foreground text-xs font-normal">(max 10 KB)</span>
            </label>
            <textarea
              id="custom-css"
              value={customCss}
              onChange={(e) => setCustomCss(e.target.value)}
              placeholder=":root { --brand-color: #6366f1; }"
              rows={5}
              className="w-full px-3 py-2 bg-background border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm font-mono resize-y"
              aria-describedby={errors.customCss ? 'css-error' : 'css-hint'}
            />
            <p id="css-hint" className="mt-1 text-xs text-muted-foreground">
              {customCss.length} / 10,240 characters
            </p>
            {errors.customCss && (
              <p id="css-error" role="alert" className="mt-1 text-xs text-destructive">
                {errors.customCss}
              </p>
            )}
          </div>
        </div>

        {/* Right: live preview */}
        <div>
          <p className="text-sm font-medium text-foreground mb-2">Preview</p>
          <ThemePreview
            primaryColor={primaryColor}
            secondaryColor={secondaryColor}
            accentColor={accentColor}
            logoUrl={logoUrl}
            fontFamily={fontFamily || undefined}
            customCss={customCss || undefined}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Step 4: Review ──────────────────────────────────────────────────────────

interface ReviewStepProps {
  basics: BasicsFormData | null;
  plugins: PluginsFormData | null;
  theme: ThemeFormData | null;
  onEdit: (step: 1 | 2 | 3) => void;
}

function ReviewStep({ basics, plugins, theme, onEdit }: ReviewStepProps) {
  return (
    <div className="space-y-4">
      {/* Basics section */}
      <section className="border border-border rounded-md p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground">Basics</h3>
          <button
            type="button"
            onClick={() => onEdit(1)}
            className="text-xs text-primary hover:underline focus:outline-none focus:underline"
            aria-label="Edit basics"
          >
            Edit
          </button>
        </div>
        {basics ? (
          <dl className="space-y-1 text-sm">
            <div className="flex gap-2">
              <dt className="text-muted-foreground w-28 shrink-0">Name</dt>
              <dd className="text-foreground font-medium">{basics.name}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-muted-foreground w-28 shrink-0">Slug</dt>
              <dd className="text-foreground font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                {basics.slug}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-muted-foreground w-28 shrink-0">Admin Email</dt>
              <dd className="text-foreground">{basics.adminEmail}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">Not yet filled in.</p>
        )}
      </section>

      {/* Plugins section */}
      <section className="border border-border rounded-md p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground">Plugins</h3>
          <button
            type="button"
            onClick={() => onEdit(2)}
            className="text-xs text-primary hover:underline focus:outline-none focus:underline"
            aria-label="Edit plugins selection"
          >
            Edit
          </button>
        </div>
        {plugins?.pluginIds.length ? (
          <p className="text-sm text-foreground">{plugins.pluginIds.length} plugin(s) selected</p>
        ) : (
          <p className="text-sm text-muted-foreground">No plugins selected (can be added later)</p>
        )}
      </section>

      {/* Theme section */}
      <section className="border border-border rounded-md p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground">Theme</h3>
          <button
            type="button"
            onClick={() => onEdit(3)}
            className="text-xs text-primary hover:underline focus:outline-none focus:underline"
            aria-label="Edit theme settings"
          >
            Edit
          </button>
        </div>
        {theme?.primaryColor || theme?.logoUrl ? (
          <div className="flex items-center gap-3">
            {theme.primaryColor && (
              <div
                className="w-5 h-5 rounded-full border border-border shrink-0"
                style={{ background: theme.primaryColor }}
                aria-label={`Primary color: ${theme.primaryColor}`}
              />
            )}
            {theme.secondaryColor && (
              <div
                className="w-5 h-5 rounded-full border border-border shrink-0"
                style={{ background: theme.secondaryColor }}
                aria-label={`Secondary color: ${theme.secondaryColor}`}
              />
            )}
            {theme.accentColor && (
              <div
                className="w-5 h-5 rounded-full border border-border shrink-0"
                style={{ background: theme.accentColor }}
                aria-label={`Accent color: ${theme.accentColor}`}
              />
            )}
            {theme.logoUrl && (
              <span className="text-xs text-muted-foreground truncate">Logo set</span>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Using default theme (can be customized later)
          </p>
        )}
      </section>
    </div>
  );
}

// ─── Provisioning View ────────────────────────────────────────────────────────

interface ProvisioningViewProps {
  tenantId: string;
  onSuccess: (tenantId: string) => void;
  onError: (error: string) => void;
}

function ProvisioningView({ tenantId, onSuccess, onError }: ProvisioningViewProps) {
  const [steps, setSteps] = useState(
    PROVISIONING_STEPS.map((s) => ({
      ...s,
      status: 'pending' as 'pending' | 'in_progress' | 'complete' | 'error',
    }))
  );
  const [overallProgress, setOverallProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const poll = useCallback(async () => {
    try {
      const tenant = await apiClient.getTenant(tenantId);
      const provisioningState = (tenant.settings?.provisioningState ?? {}) as {
        steps?: Array<{ step: string; status: string; error?: string }>;
        status?: string;
        error?: string;
      };

      const stepStatuses = provisioningState.steps ?? [];
      const updatedSteps = PROVISIONING_STEPS.map((s) => {
        const found = stepStatuses.find((ps) => ps.step === s.id);
        return {
          ...s,
          status: (found?.status as 'pending' | 'in_progress' | 'complete' | 'error') ?? 'pending',
        };
      });
      setSteps(updatedSteps);

      const completed = updatedSteps.filter((s) => s.status === 'complete').length;
      setOverallProgress(Math.round((completed / PROVISIONING_STEPS.length) * 100));

      if (tenant.status === 'ACTIVE') {
        stopPolling();
        onSuccess(tenantId);
        return;
      }

      if (tenant.status !== 'PROVISIONING') {
        const err = provisioningState.error ?? 'Provisioning failed';
        setErrorMessage(err);
        stopPolling();
        onError(err);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to check provisioning status';
      setErrorMessage(msg);
      stopPolling();
      onError(msg);
    }
  }, [tenantId, onSuccess, onError, stopPolling]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    poll();
    pollRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return stopPolling;
  }, [poll, stopPolling]);

  return (
    <ProvisioningProgress
      steps={steps}
      overallProgress={overallProgress}
      errorMessage={errorMessage}
    />
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface CreateTenantWizardProps {
  onClose: () => void;
  onSuccess: () => void;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function CreateTenantWizard({ onClose, onSuccess }: CreateTenantWizardProps) {
  const [wizardState, dispatch] = useWizardState();

  // Per-step live data (unvalidated) fed from child components
  const [basicsLive, setBasicsLive] = useState<{ data: BasicsFormData; isValid: boolean } | null>(
    null
  );
  const [pluginsLive, setPluginsLive] = useState<PluginsFormData>({ pluginIds: [] });
  const [themeLive, setThemeLive] = useState<ThemeFormData>({});

  // Track if the current step's Next should be disabled
  const isNextDisabled =
    wizardState.phase === 'filling' &&
    wizardState.step === 1 &&
    (basicsLive === null || !basicsLive.isValid);

  const isReviewStep = wizardState.step === 4;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [provisioningTenantId, setProvisioningTenantId] = useState<string | null>(null);

  // Zero-based index for StepWizard (it uses 0-based)
  const currentStepIndex = wizardState.step - 1;

  // ── Handlers ────────────────────────────────────────────────────────────────

  // Defined before handleNext so it can be included in handleNext's deps array.
  const handleSubmit = useCallback(async () => {
    const { basics, plugins, theme } = wizardState.data;
    if (!basics) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      dispatch({ type: 'START_PROVISIONING' });
      const tenant = await apiClient.createTenant({
        name: basics.name,
        slug: basics.slug,
        adminEmail: basics.adminEmail,
        pluginIds: plugins?.pluginIds ?? [],
        // theme is sent via a separate update or via the create body
        ...(theme && Object.keys(theme).length > 0 ? { theme } : {}),
      } as Parameters<typeof apiClient.createTenant>[0]);

      setProvisioningTenantId(tenant.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to create tenant';
      setSubmitError(msg);
      dispatch({ type: 'PROVISIONING_ERROR', error: msg });
    } finally {
      setIsSubmitting(false);
    }
  }, [wizardState, dispatch]);

  const handleNext = useCallback(async () => {
    if (wizardState.phase !== 'filling') return;

    switch (wizardState.step) {
      case 1: {
        if (!basicsLive?.isValid || !basicsLive.data) return;
        const result = basicsSchema.safeParse(basicsLive.data);
        if (!result.success) return;
        dispatch({ type: 'COMPLETE_STEP_1', data: result.data });
        break;
      }
      case 2: {
        const result = pluginsSchema.safeParse(pluginsLive);
        dispatch({
          type: 'COMPLETE_STEP_2',
          data: result.success ? result.data : { pluginIds: [] },
        });
        break;
      }
      case 3: {
        const result = themeSchema.safeParse(themeLive);
        dispatch({ type: 'COMPLETE_STEP_3', data: result.success ? result.data : {} });
        break;
      }
      case 4: {
        // Submit
        await handleSubmit();
        break;
      }
    }
  }, [wizardState, basicsLive, pluginsLive, themeLive, dispatch, handleSubmit]);

  const handleBack = useCallback(() => {
    dispatch({ type: 'GO_BACK' });
  }, [dispatch]);

  const handleSkip = useCallback(() => {
    dispatch({ type: 'SKIP_STEP' });
  }, [dispatch]);

  const handleCancel = useCallback(() => {
    if (wizardState.phase === 'provisioning') return; // Can't cancel while provisioning
    // If any data entered, confirm before closing
    const hasData = wizardState.data.basics !== null;
    if (hasData && !confirm('Cancel tenant creation? Your progress will be lost.')) return;
    dispatch({ type: 'RESET' });
    onClose();
  }, [wizardState, dispatch, onClose]);

  const handleEditStep = useCallback(
    (step: 1 | 2 | 3) => {
      dispatch({ type: 'GO_TO_STEP', step });
    },
    [dispatch]
  );

  // ── Render ────────────────────────────────────────────────────────────────

  // Provisioning phase — show progress inside the dialog
  if (wizardState.phase === 'provisioning' && provisioningTenantId) {
    return (
      <div
        className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center"
        role="dialog"
        aria-modal="true"
        aria-label="Tenant provisioning in progress"
      >
        <div className="bg-background border border-border rounded-lg shadow-lg w-full max-w-lg p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Setting up your tenant…</h2>
          <ProvisioningView
            tenantId={provisioningTenantId}
            onSuccess={(id) => {
              dispatch({ type: 'PROVISIONING_SUCCESS', tenantId: id });
            }}
            onError={(err) => {
              dispatch({ type: 'PROVISIONING_ERROR', error: err });
            }}
          />
        </div>
      </div>
    );
  }

  // Success phase
  if (wizardState.phase === 'success') {
    return (
      <div
        className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center"
        role="dialog"
        aria-modal="true"
        aria-label="Tenant created successfully"
      >
        <div className="bg-background border border-border rounded-lg shadow-lg w-full max-w-md p-6 text-center">
          <div
            className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4"
            aria-hidden="true"
          >
            <svg
              className="w-6 h-6 text-green-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-2">Tenant created!</h2>
          <p className="text-sm text-muted-foreground mb-6">
            The tenant has been provisioned successfully.
          </p>
          <button
            type="button"
            onClick={() => {
              dispatch({ type: 'RESET' });
              onSuccess();
            }}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  // Error phase (provisioning failed)
  if (wizardState.phase === 'error') {
    return (
      <div
        className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center"
        role="alertdialog"
        aria-modal="true"
        aria-label="Tenant creation failed"
      >
        <div className="bg-background border border-border rounded-lg shadow-lg w-full max-w-md p-6">
          <h2 className="text-lg font-semibold text-foreground mb-2">Provisioning failed</h2>
          <p className="text-sm text-destructive mb-4">
            {wizardState.provisioningError ?? 'An unexpected error occurred.'}
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => {
                dispatch({ type: 'RESET' });
                onClose();
              }}
              className="px-4 py-2 border border-border rounded-md text-sm font-medium text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => {
                dispatch({ type: 'RESET' });
              }}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary"
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Filling phase — main wizard
  return (
    <StepWizard
      open={true}
      steps={WIZARD_STEPS}
      currentStep={currentStepIndex}
      title="Create New Tenant"
      isNextDisabled={isNextDisabled || isSubmitting}
      isNextLoading={isSubmitting}
      nextLabel={isReviewStep ? 'Create Tenant' : undefined}
      onNext={handleNext}
      onBack={handleBack}
      onSkip={wizardState.step === 2 || wizardState.step === 3 ? handleSkip : undefined}
      onCancel={handleCancel}
    >
      {/* Submission error (review step) */}
      {submitError && isReviewStep && (
        <div
          role="alert"
          className="mb-4 p-3 rounded-md bg-destructive/10 border border-destructive/30 text-sm text-destructive"
        >
          {submitError}
        </div>
      )}

      {/* Step content */}
      {wizardState.step === 1 && (
        <BasicsStep
          initial={wizardState.data.basics}
          onValid={(data, isValid) => setBasicsLive({ data, isValid })}
        />
      )}
      {wizardState.step === 2 && (
        <PluginsStep initial={wizardState.data.plugins} onChange={setPluginsLive} />
      )}
      {wizardState.step === 3 && (
        <ThemeStep initial={wizardState.data.theme} onChange={setThemeLive} />
      )}
      {wizardState.step === 4 && (
        <ReviewStep
          basics={wizardState.data.basics}
          plugins={wizardState.data.plugins}
          theme={wizardState.data.theme}
          onEdit={handleEditStep}
        />
      )}
    </StepWizard>
  );
}
