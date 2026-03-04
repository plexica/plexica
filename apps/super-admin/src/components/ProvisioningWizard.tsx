// File: apps/super-admin/src/components/ProvisioningWizard.tsx
//
// T008-45 — Tenant Create Wizard component (Spec 008 Admin Interfaces).
//
// 3-step wizard:
//   Step 1 — Details: name, slug (auto-generated, editable), admin email
//   Step 2 — Configure: theme colour, initial plugins, max users
//   Step 3 — Provisioning: SSE progress + polling fallback
//
// State managed via useReducer; serialised to sessionStorage on every dispatch
// (ADR-016 — survives accidental page refresh).
//
// SSE resilience: onerror → close EventSource → polling fallback every 5s
// for up to 30s (6 attempts). Re-subscribes via Last-Event-ID when available.
//
// Spec 008 — T008-45

import { useReducer, useEffect, useRef, useCallback, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { z } from 'zod';
import { CheckCircle, XCircle, Loader2, ArrowLeft, ArrowRight, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Card, CardContent, Input, Label } from '@plexica/ui';
import { useCreateTenant } from '@/hooks/useTenants';
import { apiClient } from '@/lib/api-client';

// ---------------------------------------------------------------------------
// Slugify helper
// ---------------------------------------------------------------------------

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}

// ---------------------------------------------------------------------------
// Provisioning step info
// ---------------------------------------------------------------------------

const PROVISIONING_STEPS = [
  { key: 'schema', label: 'Creating schema…' },
  { key: 'migrations', label: 'Running migrations…' },
  { key: 'seeding', label: 'Seeding data…' },
  { key: 'activating', label: 'Activating tenant…' },
] as const;

type ProvisioningStepKey = (typeof PROVISIONING_STEPS)[number]['key'];

export interface ProvisioningStatus {
  currentStep: ProvisioningStepKey | 'done' | 'error';
  completedSteps: ProvisioningStepKey[];
  errorMessage?: string;
  tenantId?: string;
}

// ---------------------------------------------------------------------------
// Wizard state
// ---------------------------------------------------------------------------

export interface Step1Data {
  name: string;
  slug: string;
  adminEmail: string;
}

export interface Step2Data {
  primaryColor: string;
  maxUsers: string;
  pluginIds: string[];
}

export interface WizardState {
  step: 1 | 2 | 3;
  formData: Partial<Step1Data & Step2Data>;
  provisioningStatus: ProvisioningStatus | null;
  error: string | null;
}

const INITIAL_WIZARD_STATE: WizardState = {
  step: 1,
  formData: {},
  provisioningStatus: null,
  error: null,
};

const SESSION_KEY = 'plexica:wizard:create-tenant';

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

type WizardAction =
  | { type: 'NEXT_STEP'; data: Partial<Step1Data & Step2Data> }
  | { type: 'PREV_STEP' }
  | { type: 'SET_PROVISIONING'; status: ProvisioningStatus }
  | { type: 'SET_ERROR'; error: string }
  | { type: 'RESET' };

function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'NEXT_STEP':
      return {
        ...state,
        step: (state.step < 3 ? state.step + 1 : state.step) as 1 | 2 | 3,
        formData: { ...state.formData, ...action.data },
        error: null,
      };
    case 'PREV_STEP':
      return {
        ...state,
        step: (state.step > 1 ? state.step - 1 : state.step) as 1 | 2 | 3,
        error: null,
      };
    case 'SET_PROVISIONING':
      return { ...state, provisioningStatus: action.status };
    case 'SET_ERROR':
      return { ...state, error: action.error };
    case 'RESET':
      return INITIAL_WIZARD_STATE;
    default:
      return state;
  }
}

function loadStateFromSession(): WizardState {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) return JSON.parse(raw) as WizardState;
  } catch {
    // ignore
  }
  return INITIAL_WIZARD_STATE;
}

function saveStateToSession(state: WizardState) {
  try {
    // Don't persist step 3 provisioning state — always restart provisioning fresh
    if (state.step === 3) {
      sessionStorage.removeItem(SESSION_KEY);
    } else {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(state));
    }
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Step indicator
// ---------------------------------------------------------------------------

const STEP_LABELS = ['Details', 'Configure', 'Provisioning'];

interface StepIndicatorProps {
  current: 1 | 2 | 3;
}

function StepIndicator({ current }: StepIndicatorProps) {
  return (
    <nav aria-label="Wizard steps" className="mb-8">
      <ol className="flex items-center gap-0">
        {STEP_LABELS.map((label, i) => {
          const stepNum = (i + 1) as 1 | 2 | 3;
          const isDone = stepNum < current;
          const isActive = stepNum === current;
          return (
            <li key={label} className="flex items-center flex-1">
              <div className="flex flex-col items-center gap-1 flex-1">
                <span
                  className={[
                    'inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold border-2 transition-colors',
                    isDone
                      ? 'var(--wizard-step-complete, bg-green-500 border-green-500 text-white)'
                      : isActive
                        ? 'var(--wizard-step-active, bg-primary border-primary text-primary-foreground)'
                        : 'var(--wizard-step-pending, bg-muted border-muted-foreground/30 text-muted-foreground)',
                    isDone
                      ? 'bg-green-500 border-green-500 text-white'
                      : isActive
                        ? 'bg-primary border-primary text-primary-foreground'
                        : 'bg-muted border-muted-foreground/30 text-muted-foreground',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-current={isActive ? 'step' : undefined}
                >
                  {isDone ? <CheckCircle className="h-4 w-4" aria-hidden="true" /> : stepNum}
                </span>
                <span
                  className={`text-xs font-medium ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}
                >
                  {label}
                </span>
              </div>
              {i < STEP_LABELS.length - 1 && (
                <div
                  className={`h-0.5 flex-1 mt-[-1rem] ${isDone ? 'bg-green-500' : 'bg-muted-foreground/20'}`}
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — Details
// ---------------------------------------------------------------------------

const step1Schema = z.object({
  name: z.string().min(1, 'Name is required').min(3, 'Name must be at least 3 characters'),
  slug: z
    .string()
    .min(1, 'Slug is required')
    .min(3, 'Slug must be at least 3 characters')
    .max(63, 'Slug too long')
    .regex(/^[a-z0-9-]+$/, 'Slug may only contain lowercase letters, numbers, and hyphens'),
  adminEmail: z.string().min(1, 'Admin email is required').email('Must be a valid email address'),
});

interface Step1Props {
  defaultValues: Partial<Step1Data>;
  onNext: (data: Step1Data) => void;
}

function Step1({ defaultValues, onNext }: Step1Props) {
  const [name, setName] = useState(defaultValues.name ?? '');
  const [slug, setSlug] = useState(defaultValues.slug ?? '');
  const [adminEmail, setAdminEmail] = useState(defaultValues.adminEmail ?? '');
  const [errors, setErrors] = useState<Partial<Record<'name' | 'slug' | 'adminEmail', string>>>({});
  const [isCheckingSlug, setIsCheckingSlug] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Track whether slug has been manually edited (so auto-gen doesn't overwrite it)
  const slugManuallyEdited = useRef(defaultValues.slug ? true : false);

  // Auto-generate slug from name unless user manually edited the slug field
  useEffect(() => {
    if (!slugManuallyEdited.current) {
      setSlug(slugify(name));
    }
  }, [name]);

  const checkSlug = useCallback(async (value: string) => {
    if (!value || value.length < 3) return;
    setIsCheckingSlug(true);
    try {
      const result = await (
        apiClient as unknown as {
          checkSlugAvailability: (slug: string) => Promise<{ available: boolean }>;
        }
      ).checkSlugAvailability(value);
      if (!result.available) {
        setErrors((prev) => ({ ...prev, slug: 'Slug already taken' }));
      }
    } catch {
      // Non-blocking — server will validate on submit
    } finally {
      setIsCheckingSlug(false);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const result = step1Schema.safeParse({ name, slug, adminEmail });
    if (!result.success) {
      const fieldErrors: Partial<Record<'name' | 'slug' | 'adminEmail', string>> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as 'name' | 'slug' | 'adminEmail';
        if (!fieldErrors[field]) fieldErrors[field] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setIsSubmitting(true);
    try {
      onNext(result.data);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={(e) => void handleSubmit(e)} noValidate>
      <div className="space-y-5">
        {/* Tenant name */}
        <div className="space-y-1.5">
          <Label htmlFor="w-name">
            Tenant name{' '}
            <span aria-hidden="true" className="text-destructive">
              *
            </span>
          </Label>
          <Input
            id="w-name"
            type="text"
            name="name"
            value={name}
            placeholder="Acme Corporation"
            aria-required="true"
            aria-describedby={errors.name ? 'w-name-err' : undefined}
            onChange={(e) => {
              setName(e.target.value);
              if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
            }}
          />
          {errors.name && (
            <p id="w-name-err" role="alert" className="text-xs text-destructive">
              {errors.name}
            </p>
          )}
        </div>

        {/* Slug */}
        <div className="space-y-1.5">
          <Label htmlFor="w-slug">
            Slug{' '}
            <span aria-hidden="true" className="text-destructive">
              *
            </span>
          </Label>
          <div className="relative">
            <Input
              id="w-slug"
              type="text"
              name="slug"
              value={slug}
              placeholder="acme-corporation"
              aria-required="true"
              aria-describedby={errors.slug ? 'w-slug-err' : 'w-slug-hint'}
              onChange={(e) => {
                slugManuallyEdited.current = true;
                setSlug(e.target.value);
                if (errors.slug) setErrors((prev) => ({ ...prev, slug: undefined }));
              }}
              onBlur={(e) => void checkSlug(e.target.value)}
            />
            {isCheckingSlug && (
              <Loader2
                className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-muted-foreground"
                aria-hidden="true"
              />
            )}
          </div>
          <p id="w-slug-hint" className="text-xs text-muted-foreground">
            Unique URL-safe identifier. Auto-generated from name.
          </p>
          {errors.slug && (
            <p id="w-slug-err" role="alert" className="text-xs text-destructive">
              {errors.slug}
            </p>
          )}
        </div>

        {/* Admin email */}
        <div className="space-y-1.5">
          <Label htmlFor="w-email">
            Admin email{' '}
            <span aria-hidden="true" className="text-destructive">
              *
            </span>
          </Label>
          <Input
            id="w-email"
            type="email"
            name="adminEmail"
            value={adminEmail}
            placeholder="admin@acme.com"
            aria-required="true"
            aria-describedby={errors.adminEmail ? 'w-email-err' : undefined}
            onChange={(e) => {
              setAdminEmail(e.target.value);
              if (errors.adminEmail) setErrors((prev) => ({ ...prev, adminEmail: undefined }));
            }}
          />
          {errors.adminEmail && (
            <p id="w-email-err" role="alert" className="text-xs text-destructive">
              {errors.adminEmail}
            </p>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <Button type="submit" disabled={isSubmitting || isCheckingSlug}>
            Next
            <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Configure
// ---------------------------------------------------------------------------

const step2Schema = z.object({
  primaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Must be a valid hex colour')
    .or(z.literal('')),
  maxUsers: z
    .string()
    .refine(
      (v) => v === '' || (/^\d+$/.test(v) && Number(v) > 0),
      'Must be a positive integer or leave empty for unlimited'
    ),
});

interface Step2Props {
  defaultValues: Partial<Step2Data>;
  onNext: (data: Step2Data) => void;
  onBack: () => void;
  isSubmitting: boolean;
}

function Step2({ defaultValues, onNext, onBack, isSubmitting }: Step2Props) {
  const [primaryColor, setPrimaryColor] = useState(defaultValues.primaryColor ?? '#3b82f6');
  const [maxUsers, setMaxUsers] = useState(defaultValues.maxUsers ?? '');
  const [errors, setErrors] = useState<Partial<Record<'primaryColor' | 'maxUsers', string>>>({});

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const result = step2Schema.safeParse({ primaryColor, maxUsers });
    if (!result.success) {
      const fieldErrors: Partial<Record<'primaryColor' | 'maxUsers', string>> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as 'primaryColor' | 'maxUsers';
        if (!fieldErrors[field]) fieldErrors[field] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    onNext({ ...result.data, pluginIds: defaultValues.pluginIds ?? [] });
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="space-y-5">
        {/* Primary colour */}
        <div className="space-y-1.5">
          <Label htmlFor="w-color">Theme primary colour</Label>
          <div className="flex items-center gap-3">
            <input
              id="w-color-picker"
              type="color"
              value={primaryColor}
              className="h-9 w-14 cursor-pointer rounded border border-input bg-transparent p-0.5"
              aria-label="Pick theme colour"
              onChange={(e) => {
                setPrimaryColor(e.target.value);
                if (errors.primaryColor)
                  setErrors((prev) => ({ ...prev, primaryColor: undefined }));
              }}
            />
            <Input
              id="w-color"
              type="text"
              value={primaryColor}
              placeholder="#3b82f6"
              aria-describedby={errors.primaryColor ? 'w-color-err' : undefined}
              onChange={(e) => {
                setPrimaryColor(e.target.value);
                if (errors.primaryColor)
                  setErrors((prev) => ({ ...prev, primaryColor: undefined }));
              }}
            />
          </div>
          {errors.primaryColor && (
            <p id="w-color-err" role="alert" className="text-xs text-destructive">
              {errors.primaryColor}
            </p>
          )}
        </div>

        {/* Max users */}
        <div className="space-y-1.5">
          <Label htmlFor="w-max-users">Max users</Label>
          <Input
            id="w-max-users"
            type="number"
            min={1}
            value={maxUsers}
            placeholder="Unlimited"
            aria-describedby={errors.maxUsers ? 'w-maxusers-err' : 'w-maxusers-hint'}
            onChange={(e) => {
              setMaxUsers(e.target.value);
              if (errors.maxUsers) setErrors((prev) => ({ ...prev, maxUsers: undefined }));
            }}
          />
          <p id="w-maxusers-hint" className="text-xs text-muted-foreground">
            Leave empty for unlimited users.
          </p>
          {errors.maxUsers && (
            <p id="w-maxusers-err" role="alert" className="text-xs text-destructive">
              {errors.maxUsers}
            </p>
          )}
        </div>

        <div className="flex justify-between pt-2">
          <Button type="button" variant="outline" onClick={onBack}>
            <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Back
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
                Creating…
              </>
            ) : (
              'Create Tenant'
            )}
          </Button>
        </div>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Provisioning progress
// ---------------------------------------------------------------------------

const STEP_ORDER: ProvisioningStepKey[] = ['schema', 'migrations', 'seeding', 'activating'];

function stepIndex(key: ProvisioningStepKey): number {
  return STEP_ORDER.indexOf(key);
}

interface Step3Props {
  status: ProvisioningStatus | null;
  onDone: (tenantId: string) => void;
  onRetry: () => void;
}

function Step3({ status, onDone, onRetry }: Step3Props) {
  const completedCount = status?.completedSteps.length ?? 0;
  const totalSteps = PROVISIONING_STEPS.length;
  const progressPct = Math.round((completedCount / totalSteps) * 100);
  const isDone = status?.currentStep === 'done';
  const isError = status?.currentStep === 'error';

  useEffect(() => {
    if (isDone && status?.tenantId) {
      const timer = setTimeout(() => onDone(status.tenantId!), 1500);
      return () => clearTimeout(timer);
    }
  }, [isDone, status?.tenantId, onDone]);

  return (
    <div className="space-y-6">
      {/* Progress bar */}
      <div>
        <div className="flex justify-between text-sm mb-2">
          <span className="font-medium text-foreground">Provisioning…</span>
          <span className="text-muted-foreground tabular-nums">{progressPct}%</span>
        </div>
        <div
          role="progressbar"
          aria-valuenow={progressPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Provisioning progress"
          className="h-2 w-full rounded-full bg-muted overflow-hidden"
        >
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Step list */}
      <div aria-live="polite" aria-label="Provisioning steps" className="space-y-3">
        {PROVISIONING_STEPS.map(({ key, label }) => {
          const isCompleted = status?.completedSteps.includes(key) ?? false;
          const isCurrent = !isCompleted && status?.currentStep === key;
          const isErrorStep =
            isError &&
            !isCompleted &&
            stepIndex(key) >= stepIndex(status?.currentStep as ProvisioningStepKey);

          return (
            <div key={key} className="flex items-center gap-3">
              <span className="flex h-6 w-6 items-center justify-center flex-shrink-0">
                {isCompleted ? (
                  <CheckCircle
                    className="h-5 w-5 text-green-500"
                    aria-label={`${label} complete`}
                  />
                ) : isErrorStep ? (
                  <XCircle className="h-5 w-5 text-destructive" aria-label={`${label} failed`} />
                ) : isCurrent ? (
                  <Loader2
                    className="h-5 w-5 text-primary animate-spin"
                    aria-label={`${label} in progress`}
                  />
                ) : (
                  <span
                    className="h-5 w-5 rounded-full border-2 border-muted-foreground/30"
                    aria-hidden="true"
                  />
                )}
              </span>
              <span
                className={`text-sm ${isCompleted ? 'text-foreground' : 'text-muted-foreground'}`}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Error state */}
      {isError && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-destructive text-sm space-y-2"
        >
          <p className="font-medium">Provisioning failed</p>
          {status?.errorMessage && <p>{status.errorMessage}</p>}
          <Button variant="outline" size="sm" onClick={onRetry}>
            Try again
          </Button>
        </div>
      )}

      {/* Done state */}
      {isDone && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-green-800 text-sm"
        >
          <CheckCircle className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
          <span>Tenant created successfully! Redirecting…</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main ProvisioningWizard component
// ---------------------------------------------------------------------------

interface ProvisioningWizardProps {
  onCancel: () => void;
}

export function ProvisioningWizard({ onCancel }: ProvisioningWizardProps) {
  const navigate = useNavigate();
  const [state, dispatch] = useReducer(wizardReducer, undefined, loadStateFromSession);

  // Persist state to sessionStorage on every change
  useEffect(() => {
    saveStateToSession(state);
  }, [state]);

  const createTenant = useCreateTenant();

  // SSE + polling refs
  const sseRef = useRef<EventSource | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollAttemptsRef = useRef(0);
  const lastEventIdRef = useRef<string | null>(null);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    pollAttemptsRef.current = 0;
  }, []);

  const stopSSE = useCallback(() => {
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }
  }, []);

  // Poll for provisioning status as fallback
  const startPolling = useCallback(
    (tenantId: string) => {
      stopPolling();
      pollAttemptsRef.current = 0;

      pollIntervalRef.current = setInterval(async () => {
        pollAttemptsRef.current += 1;
        try {
          const tenant = await (
            apiClient as unknown as {
              getTenant: (id: string) => Promise<{ status: string; id: string }>;
            }
          ).getTenant(tenantId);

          if (tenant.status === 'ACTIVE') {
            stopPolling();
            dispatch({
              type: 'SET_PROVISIONING',
              status: {
                currentStep: 'done',
                completedSteps: ['schema', 'migrations', 'seeding', 'activating'],
                tenantId,
              },
            });
          } else if (tenant.status === 'ERROR' || tenant.status === 'FAILED') {
            stopPolling();
            dispatch({
              type: 'SET_PROVISIONING',
              status: {
                currentStep: 'error',
                completedSteps: [],
                errorMessage: 'Provisioning failed. Please try again.',
              },
            });
          } else if (pollAttemptsRef.current >= 6) {
            // 6 × 5s = 30s max
            stopPolling();
            dispatch({
              type: 'SET_PROVISIONING',
              status: {
                currentStep: 'error',
                completedSteps: [],
                errorMessage:
                  'Provisioning is taking too long. Please refresh the tenant list to check status.',
              },
            });
          }
        } catch {
          // Ignore individual poll failures
        }
      }, 5000);
    },
    [stopPolling]
  );

  // Connect SSE for provisioning events
  const startSSE = useCallback(
    (tenantId: string) => {
      stopSSE();

      const apiBase =
        (import.meta as unknown as { env: { VITE_API_URL?: string } }).env.VITE_API_URL ??
        'http://localhost:3000';
      const url = lastEventIdRef.current
        ? `${apiBase}/api/v1/notifications/stream?tenantId=${tenantId}&lastEventId=${lastEventIdRef.current}`
        : `${apiBase}/api/v1/notifications/stream?tenantId=${tenantId}`;

      const es = new EventSource(url, { withCredentials: true });
      sseRef.current = es;

      es.addEventListener(`provisioning:${tenantId}`, (ev: MessageEvent) => {
        try {
          const payload = JSON.parse(ev.data as string) as {
            step?: ProvisioningStepKey;
            status?: 'done' | 'error';
            completedSteps?: ProvisioningStepKey[];
            errorMessage?: string;
          };

          if (ev.lastEventId) lastEventIdRef.current = ev.lastEventId;

          if (payload.status === 'done') {
            stopSSE();
            dispatch({
              type: 'SET_PROVISIONING',
              status: {
                currentStep: 'done',
                completedSteps: ['schema', 'migrations', 'seeding', 'activating'],
                tenantId,
              },
            });
          } else if (payload.status === 'error') {
            stopSSE();
            dispatch({
              type: 'SET_PROVISIONING',
              status: {
                currentStep: 'error',
                completedSteps: payload.completedSteps ?? [],
                errorMessage: payload.errorMessage,
              },
            });
          } else if (payload.step) {
            dispatch({
              type: 'SET_PROVISIONING',
              status: {
                currentStep: payload.step,
                completedSteps: payload.completedSteps ?? [],
                tenantId,
              },
            });
          }
        } catch {
          // Ignore parse errors
        }
      });

      // SSE error → fall back to polling (resolves MEDIUM ISSUE-004)
      es.onerror = () => {
        stopSSE();
        startPolling(tenantId);
      };
    },
    [stopSSE, startPolling]
  );

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopSSE();
      stopPolling();
    };
  }, [stopSSE, stopPolling]);

  // ---------------------------------------------------------------------------
  // Step handlers
  // ---------------------------------------------------------------------------

  const handleStep1Next = (data: Step1Data) => {
    dispatch({ type: 'NEXT_STEP', data });
  };

  const handleStep2Back = () => {
    dispatch({ type: 'PREV_STEP' });
  };

  const handleStep2Next = async (data: Step2Data) => {
    const formData = { ...state.formData, ...data } as Step1Data & Step2Data;
    try {
      const tenant = await createTenant.mutateAsync({
        name: formData.name,
        slug: formData.slug,
        adminEmail: formData.adminEmail,
        pluginIds: formData.pluginIds,
      });

      dispatch({ type: 'NEXT_STEP', data });

      // Start provisioning monitoring
      const tenantId = (tenant as unknown as { id: string }).id;
      dispatch({
        type: 'SET_PROVISIONING',
        status: {
          currentStep: 'schema',
          completedSteps: [],
          tenantId,
        },
      });

      startSSE(tenantId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create tenant';
      dispatch({ type: 'SET_ERROR', error: msg });
      toast.error('Failed to create tenant', { description: msg });
    }
  };

  const handleProvisioningDone = (tenantId: string) => {
    sessionStorage.removeItem(SESSION_KEY);
    toast.success('Tenant created successfully');
    void navigate({ to: `/_layout/tenants/${tenantId}` as never });
  };

  const handleRetry = () => {
    dispatch({ type: 'RESET' });
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <Card className="max-w-2xl mx-auto">
      <CardContent className="pt-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <Building2 className="h-5 w-5 text-primary" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Create Tenant</h2>
            <p className="text-sm text-muted-foreground">
              Provision a new isolated tenant environment
            </p>
          </div>
        </div>

        <StepIndicator current={state.step} />

        {/* Error banner (wizard-level) */}
        {state.error && state.step !== 3 && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-destructive text-sm"
          >
            {state.error}
          </div>
        )}

        {state.step === 1 && <Step1 defaultValues={state.formData} onNext={handleStep1Next} />}

        {state.step === 2 && (
          <Step2
            defaultValues={state.formData}
            onNext={(data) => void handleStep2Next(data)}
            onBack={handleStep2Back}
            isSubmitting={createTenant.isPending}
          />
        )}

        {state.step === 3 && (
          <Step3
            status={state.provisioningStatus}
            onDone={handleProvisioningDone}
            onRetry={handleRetry}
          />
        )}

        {/* Cancel — only on steps 1-2 */}
        {state.step < 3 && (
          <div className="mt-6 border-t pt-4 flex justify-start">
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
