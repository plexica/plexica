import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
import { z } from 'zod';
import type { Tenant } from '../../types';
import { apiClient } from '../../lib/api-client';

interface EditTenantModalProps {
  tenant: Tenant;
  onClose: () => void;
  onSuccess: () => void;
}

const nameSchema = z
  .string()
  .min(1, 'Tenant name is required')
  .min(3, 'Tenant name must be at least 3 characters')
  .max(50, 'Tenant name must not exceed 50 characters')
  .trim();

export function EditTenantModal({ tenant, onClose, onSuccess }: EditTenantModalProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(tenant.name);
  const [nameError, setNameError] = useState<string | undefined>(undefined);
  const [touched, setTouched] = useState(false);

  const updateMutation = useMutation({
    mutationFn: (data: { name: string }) => apiClient.updateTenant(tenant.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      queryClient.invalidateQueries({ queryKey: ['tenants-stats'] });
      queryClient.invalidateQueries({ queryKey: ['tenant', tenant.id] });
      onSuccess();
    },
  });

  const validateName = (value: string): string | undefined => {
    try {
      nameSchema.parse(value);
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
    if (touched) {
      setNameError(validateName(value));
    }
  };

  const handleBlur = () => {
    setTouched(true);
    setNameError(validateName(name));
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setTouched(true);

    const error = validateName(name);
    if (error) {
      setNameError(error);
      return;
    }

    // Only submit if the name actually changed
    if (name.trim() === tenant.name) {
      onClose();
      return;
    }

    updateMutation.mutate({ name: name.trim() });
  };

  const hasChanged = name.trim() !== tenant.name;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Edit Tenant</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">{tenant.slug}</p>
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
            {updateMutation.isError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>
                  Failed to update tenant: {(updateMutation.error as Error).message}
                </AlertDescription>
              </Alert>
            )}

            {/* Name Field */}
            <div className="space-y-2">
              <Label htmlFor="edit-name">
                Tenant Name
                <span className="text-destructive ml-1">*</span>
              </Label>
              <Input
                id="edit-name"
                value={name}
                onChange={handleNameChange}
                onBlur={handleBlur}
                placeholder="ACME Corporation"
                className={nameError ? 'border-destructive' : ''}
                disabled={updateMutation.isPending}
              />
              {touched && nameError && <p className="text-xs text-destructive">{nameError}</p>}
              {!nameError && name.length > 0 && touched && (
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Valid tenant name
                </p>
              )}
            </div>

            {/* Slug (read-only) */}
            <div className="space-y-2">
              <Label htmlFor="edit-slug">Tenant Slug</Label>
              <Input
                id="edit-slug"
                value={tenant.slug}
                disabled
                className="bg-muted/50 cursor-not-allowed"
              />
              <p className="text-xs text-muted-foreground">Slug cannot be changed after creation</p>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={updateMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={updateMutation.isPending || !!nameError || !hasChanged}
              >
                {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
