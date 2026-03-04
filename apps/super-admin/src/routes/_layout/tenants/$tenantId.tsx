// File: apps/super-admin/src/routes/_layout/tenants/$tenantId.tsx
//
// Tenant Detail / Edit screen — T008-44 (Spec 008 Admin Interfaces).
//
// The parent _layout.tsx handles auth, sidebar, and header.
// This component renders content directly — no ProtectedRoute or AppLayout wrapper.
//
// Features:
//   - Fetches a single tenant by ID
//   - Controlled edit form validated with Zod (name, max users, theme primary colour)
//   - Save → updateTenant mutation + success toast
//   - Breadcrumb: Super Admin > Tenants > {tenantName}
//   - Back button returns to /_layout/tenants/
//   - Loading skeleton  |  Error state with back button

import { useState, useEffect } from 'react';
import { createFileRoute, useNavigate, useParams } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { ChevronRight, ArrowLeft, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Card, CardContent, Input, Label, Skeleton } from '@plexica/ui';
import { TenantStatusBadge } from '@/components/TenantStatusBadge';
import { useUpdateTenant } from '@/hooks/useTenants';
import { apiClient } from '@/lib/api-client';

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/_layout/tenants/$tenantId' as never)({
  component: TenantDetailPage,
});

// ---------------------------------------------------------------------------
// Zod schema
// ---------------------------------------------------------------------------

const editSchema = z.object({
  name: z.string().min(1, 'Name is required').min(3, 'Name must be at least 3 characters').trim(),
  maxUsers: z
    .string()
    .refine(
      (v) => v === '' || (/^\d+$/.test(v) && Number(v) > 0),
      'Must be a positive integer or empty'
    )
    .optional(),
  primaryColor: z
    .string()
    .refine(
      (v) => v === '' || /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v),
      'Must be a valid hex colour (e.g. #3b82f6)'
    )
    .optional(),
});

type EditFields = { name: string; maxUsers: string; primaryColor: string };
type EditErrors = Partial<Record<keyof EditFields, string>>;

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function DetailSkeleton() {
  return (
    <div className="space-y-6 max-w-2xl" aria-busy="true" aria-label="Loading tenant…">
      <Skeleton width={240} height={14} shape="line" />
      <div className="space-y-2">
        <Skeleton width={200} height={28} shape="rect" />
        <Skeleton width={120} height={16} shape="line" />
      </div>
      <Card>
        <CardContent className="pt-6 space-y-5">
          <Skeleton width="100%" height={36} shape="rect" />
          <Skeleton width="60%" height={36} shape="rect" />
          <Skeleton width="40%" height={36} shape="rect" />
          <Skeleton width={100} height={36} shape="rect" className="mt-2" />
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

interface ErrorStateProps {
  message: string;
  onBack: () => void;
}

function ErrorState({ message, onBack }: ErrorStateProps) {
  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack} className="-ml-1">
        <ArrowLeft className="h-4 w-4 mr-1" aria-hidden="true" />
        Back to tenants
      </Button>
      <div
        role="alert"
        className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-4 text-red-800"
      >
        <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" aria-hidden="true" />
        <div>
          <p className="font-medium text-sm">Failed to load tenant</p>
          <p className="text-sm mt-0.5 text-red-700">{message}</p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

function TenantDetailPage() {
  const { tenantId } = useParams({ strict: false }) as { tenantId: string };
  const navigate = useNavigate();
  const updateMutation = useUpdateTenant();

  const {
    data: tenant,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['tenant', tenantId],
    queryFn: () => apiClient.getTenant(tenantId),
    staleTime: 60_000,
    enabled: Boolean(tenantId),
  });

  // Controlled form state
  const [fields, setFields] = useState<EditFields>({
    name: '',
    maxUsers: '',
    primaryColor: '',
  });
  const [errors, setErrors] = useState<EditErrors>({});
  const [touched, setTouched] = useState<Partial<Record<keyof EditFields, boolean>>>({});
  // Track original values to detect dirtiness
  const [originalFields, setOriginalFields] = useState<EditFields>({
    name: '',
    maxUsers: '',
    primaryColor: '',
  });

  // Populate form when data arrives
  useEffect(() => {
    if (tenant) {
      const initial: EditFields = {
        name: tenant.name,
        maxUsers: String((tenant.settings?.maxUsers as number | undefined) ?? ''),
        primaryColor: String((tenant.theme?.primaryColor as string | undefined) ?? ''),
      };
      setFields(initial);
      setOriginalFields(initial);
      setErrors({});
      setTouched({});
    }
  }, [tenant]);

  const isDirty =
    fields.name !== originalFields.name ||
    fields.maxUsers !== originalFields.maxUsers ||
    fields.primaryColor !== originalFields.primaryColor;

  // ---------------------------------------------------------------------------
  // Validation helpers
  // ---------------------------------------------------------------------------

  const validateFields = (values: EditFields): EditErrors => {
    const result = editSchema.safeParse(values);
    if (result.success) return {};
    const errs: EditErrors = {};
    for (const issue of result.error.issues) {
      const key = issue.path[0] as keyof EditFields;
      if (!errs[key]) errs[key] = issue.message;
    }
    return errs;
  };

  const handleChange = (field: keyof EditFields, value: string) => {
    const next = { ...fields, [field]: value };
    setFields(next);
    if (touched[field]) {
      const errs = validateFields(next);
      setErrors((prev) => ({ ...prev, [field]: errs[field] }));
    }
  };

  const handleBlur = (field: keyof EditFields) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    const errs = validateFields(fields);
    setErrors((prev) => ({ ...prev, [field]: errs[field] }));
  };

  const handleBack = () => {
    navigate({ to: '/_layout/tenants/' as never });
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Mark all fields touched
    setTouched({ name: true, maxUsers: true, primaryColor: true });

    const errs = validateFields(fields);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const updateData: Parameters<typeof updateMutation.mutate>[0]['data'] = {
      name: fields.name.trim(),
    };
    if (fields.maxUsers !== '') {
      updateData.settings = {
        ...(tenant?.settings ?? {}),
        maxUsers: Number(fields.maxUsers),
      };
    }
    if (fields.primaryColor) {
      updateData.theme = {
        ...(tenant?.theme ?? {}),
        primaryColor: fields.primaryColor,
      };
    }

    updateMutation.mutate(
      { id: tenantId, data: updateData },
      {
        onSuccess: () => {
          toast.success('Tenant updated');
          // Update the "original" baseline so isDirty resets to false
          setOriginalFields({ ...fields });
          setTouched({});
        },
        onError: (err) => {
          toast.error(`Update failed: ${(err as Error).message}`);
        },
      }
    );
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (isLoading) return <DetailSkeleton />;

  if (error || !tenant) {
    return (
      <ErrorState
        message={error instanceof Error ? error.message : 'Tenant not found.'}
        onBack={handleBack}
      />
    );
  }

  const isBusy = updateMutation.isPending;

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Breadcrumb */}
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1.5 text-sm text-muted-foreground"
      >
        <span>Super Admin</span>
        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        <button
          type="button"
          onClick={handleBack}
          className="hover:text-foreground transition-colors underline-offset-2 hover:underline"
        >
          Tenants
        </button>
        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="text-foreground font-medium" aria-current="page">
          {tenant.name}
        </span>
      </nav>

      {/* Heading */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleBack}
              className="-ml-1"
              aria-label="Back to tenants"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </Button>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{tenant.name}</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground ml-8">
            Slug:{' '}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">{tenant.slug}</code>
          </p>
        </div>
        <TenantStatusBadge status={tenant.status} />
      </div>

      {/* Edit form */}
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            {/* Mutation error */}
            {updateMutation.isError && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
              >
                <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                {(updateMutation.error as Error).message}
              </div>
            )}

            {/* Tenant Name */}
            <div className="space-y-1.5">
              <Label htmlFor="tenant-name">
                Tenant Name{' '}
                <span className="text-destructive" aria-hidden="true">
                  *
                </span>
              </Label>
              <Input
                id="tenant-name"
                value={fields.name}
                onChange={(e) => handleChange('name', e.target.value)}
                onBlur={() => handleBlur('name')}
                disabled={isBusy}
                aria-invalid={!!errors.name}
                aria-describedby={errors.name ? 'name-error' : undefined}
                placeholder="e.g. ACME Corporation"
              />
              {errors.name && (
                <p id="name-error" role="alert" className="text-xs text-destructive">
                  {errors.name}
                </p>
              )}
            </div>

            {/* Max Users */}
            <div className="space-y-1.5">
              <Label htmlFor="tenant-max-users">Max Users</Label>
              <Input
                id="tenant-max-users"
                type="number"
                min={1}
                value={fields.maxUsers}
                onChange={(e) => handleChange('maxUsers', e.target.value)}
                onBlur={() => handleBlur('maxUsers')}
                disabled={isBusy}
                aria-invalid={!!errors.maxUsers}
                aria-describedby={errors.maxUsers ? 'max-users-error' : 'max-users-hint'}
                placeholder="e.g. 50"
              />
              {errors.maxUsers ? (
                <p id="max-users-error" role="alert" className="text-xs text-destructive">
                  {errors.maxUsers}
                </p>
              ) : (
                <p id="max-users-hint" className="text-xs text-muted-foreground">
                  Leave blank for no limit.
                </p>
              )}
            </div>

            {/* Theme Primary Colour */}
            <div className="space-y-1.5">
              <Label htmlFor="tenant-primary-color">Theme Primary Colour</Label>
              <Input
                id="tenant-primary-color"
                type="text"
                value={fields.primaryColor}
                onChange={(e) => handleChange('primaryColor', e.target.value)}
                onBlur={() => handleBlur('primaryColor')}
                disabled={isBusy}
                aria-invalid={!!errors.primaryColor}
                aria-describedby={errors.primaryColor ? 'color-error' : 'color-hint'}
                placeholder="#3b82f6"
                className="font-mono"
              />
              {errors.primaryColor ? (
                <p id="color-error" role="alert" className="text-xs text-destructive">
                  {errors.primaryColor}
                </p>
              ) : (
                <p id="color-hint" className="text-xs text-muted-foreground">
                  Optional hex colour, e.g. #3b82f6
                </p>
              )}
            </div>

            {/* Slug (read-only) */}
            <div className="space-y-1.5">
              <Label htmlFor="tenant-slug">Slug</Label>
              <Input
                id="tenant-slug"
                value={tenant.slug}
                disabled
                readOnly
                aria-describedby="slug-hint"
                className="bg-muted/50 cursor-not-allowed font-mono text-sm"
              />
              <p id="slug-hint" className="text-xs text-muted-foreground">
                Slugs cannot be changed after creation.
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 pt-2 border-t border-border">
              <Button type="button" variant="outline" onClick={handleBack} disabled={isBusy}>
                Cancel
              </Button>
              <Button type="submit" disabled={isBusy || !isDirty}>
                {isBusy ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Metadata panel */}
      <Card>
        <CardContent className="pt-6">
          <h2 className="text-sm font-semibold text-foreground mb-3">Tenant metadata</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <dt className="text-muted-foreground">ID</dt>
            <dd className="font-mono text-xs break-all">{tenant.id}</dd>

            <dt className="text-muted-foreground">Status</dt>
            <dd>
              <TenantStatusBadge status={tenant.status} />
            </dd>

            <dt className="text-muted-foreground">Created</dt>
            <dd>{new Date(tenant.createdAt).toLocaleString()}</dd>

            <dt className="text-muted-foreground">Updated</dt>
            <dd>{new Date(tenant.updatedAt).toLocaleString()}</dd>

            {tenant.deletionScheduledAt && (
              <>
                <dt className="text-muted-foreground">Deletion scheduled</dt>
                <dd className="text-red-700">
                  {new Date(tenant.deletionScheduledAt).toLocaleString()}
                </dd>
              </>
            )}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
