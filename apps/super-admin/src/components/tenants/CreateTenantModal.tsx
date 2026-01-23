import { useState } from 'react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Alert,
  AlertDescription,
  AlertTitle,
} from '@plexica/ui';
import { AlertCircle, X, CheckCircle2 } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '../../lib/api-client';
import { z } from 'zod';

interface CreateTenantModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

// Validation schema using Zod
const tenantSchema = z.object({
  name: z
    .string()
    .min(1, 'Tenant name is required')
    .min(3, 'Tenant name must be at least 3 characters')
    .max(50, 'Tenant name must not exceed 50 characters')
    .trim(),
  slug: z
    .string()
    .min(1, 'Tenant slug is required')
    .min(3, 'Slug must be at least 3 characters')
    .max(50, 'Slug must not exceed 50 characters')
    .regex(
      /^[a-z0-9]+(-[a-z0-9]+)*$/,
      'Slug can only contain lowercase letters, numbers, and hyphens (no leading/trailing hyphens)'
    ),
});

type TenantFormData = z.infer<typeof tenantSchema>;

export function CreateTenantModal({ onClose, onSuccess }: CreateTenantModalProps) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [errors, setErrors] = useState<Partial<Record<keyof TenantFormData, string>>>({});
  const [touched, setTouched] = useState<Partial<Record<keyof TenantFormData, boolean>>>({});

  const createMutation = useMutation({
    mutationFn: (data: { name: string; slug: string }) => apiClient.createTenant(data),
    onSuccess: () => {
      onSuccess();
    },
    onError: (error: Error) => {
      setErrors({ name: `Failed to create tenant: ${error.message}` });
    },
  });

  // Validate a single field
  const validateField = (field: 'name' | 'slug', value: string): string | undefined => {
    try {
      if (field === 'name') {
        tenantSchema.shape.name.parse(value);
      } else {
        tenantSchema.shape.slug.parse(value);
      }
      return undefined;
    } catch (error) {
      if (error instanceof z.ZodError) {
        return error.issues[0]?.message;
      }
      return 'Validation error';
    }
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setName(value);

    // Auto-generate slug from name
    const autoSlug = value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    setSlug(autoSlug);

    // Validate name if field was touched
    if (touched.name) {
      const error = validateField('name', value);
      setErrors((prev) => ({ ...prev, name: error }));
    }
  };

  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSlug(value);

    // Validate slug if field was touched
    if (touched.slug) {
      const error = validateField('slug', value);
      setErrors((prev) => ({ ...prev, slug: error }));
    }
  };

  const handleBlur = (field: 'name' | 'slug', value: string) => {
    if (field === 'name') {
      setTouched((prev) => ({ ...prev, name: true }));
    } else {
      setTouched((prev) => ({ ...prev, slug: true }));
    }
    const error = validateField(field, value);
    if (field === 'name') {
      setErrors((prev) => ({ ...prev, name: error }));
    } else {
      setErrors((prev) => ({ ...prev, slug: error }));
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Mark all fields as touched
    setTouched({ name: true, slug: true });

    // Validate all fields
    try {
      const validData = tenantSchema.parse({ name, slug });

      // Clear errors on successful validation
      setErrors({});

      // Submit the form
      createMutation.mutate(validData);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const newErrors: typeof errors = {};
        error.issues.forEach((err: z.ZodIssue) => {
          const field = err.path[0] as keyof TenantFormData;
          newErrors[field] = err.message;
        });
        setErrors(newErrors);
      }
    }
  };

  const hasErrors = Object.keys(errors).length > 0 && Object.values(errors).some((e) => e);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Create New Tenant</CardTitle>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Error Alert */}
            {createMutation.isError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>Failed to create tenant. Please try again.</AlertDescription>
              </Alert>
            )}

            {/* Name Field */}
            <div className="space-y-2">
              <Label htmlFor="name">
                Tenant Name
                <span className="text-destructive ml-1">*</span>
              </Label>
              <Input
                id="name"
                value={name}
                onChange={handleNameChange}
                onBlur={() => handleBlur('name', name)}
                placeholder="ACME Corporation"
                className={errors.name ? 'border-destructive' : ''}
                disabled={createMutation.isPending}
              />
              {touched.name && errors.name && (
                <p className="text-xs text-destructive">{errors.name}</p>
              )}
              {!errors.name && name.length > 0 && touched.name && (
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Valid tenant name
                </p>
              )}
            </div>

            {/* Slug Field */}
            <div className="space-y-2">
              <Label htmlFor="slug">
                Tenant Slug
                <span className="text-destructive ml-1">*</span>
              </Label>
              <Input
                id="slug"
                value={slug}
                onChange={handleSlugChange}
                onBlur={() => handleBlur('slug', slug)}
                placeholder="acme-corporation"
                className={errors.slug ? 'border-destructive' : ''}
                disabled={createMutation.isPending}
              />
              {touched.slug && errors.slug && (
                <p className="text-xs text-destructive">{errors.slug}</p>
              )}
              {!errors.slug && slug.length > 0 && touched.slug && (
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Valid slug
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Used in URLs and database schemas (lowercase, numbers, hyphens only)
              </p>
            </div>

            {/* Info Alert */}
            <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
              <div className="flex gap-2">
                <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-blue-900 dark:text-blue-200">
                    Note: Creating a tenant will:
                  </p>
                  <ul className="text-xs text-blue-900 dark:text-blue-200 mt-2 ml-4 list-disc space-y-1">
                    <li>Create a dedicated PostgreSQL schema</li>
                    <li>Create a Keycloak realm for authentication</li>
                    <li>Create a MinIO storage bucket</li>
                    <li>This process may take 5-10 seconds</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={createMutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending || hasErrors}>
                {createMutation.isPending ? <>Creating...</> : 'Create Tenant'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
