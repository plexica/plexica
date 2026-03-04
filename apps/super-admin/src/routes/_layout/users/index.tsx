// File: apps/super-admin/src/routes/_layout/users/index.tsx
//
// T008-47 — Super Admin Users screen.
//
// Lists all super admins, allows granting and revoking super admin access.
//
// Features:
//  - DataTable with columns: Name, Email, Granted At, Actions
//  - "Add Super Admin" button opens a Dialog (email + name inputs)
//  - Zod validation for the add form
//  - Last-admin guard: Remove button disabled with tooltip when only 1 admin
//  - Delete confirmation inline in the row (confirm/cancel buttons)
//  - Inline 409 conflict error handling
//  - Loading skeletons
//  - Error banner with retry

import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UserPlus, AlertCircle, RefreshCw, Trash2, AlertTriangle } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  Input,
  Label,
  Skeleton,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@plexica/ui';
import { toast } from 'sonner';
import { z } from 'zod';
import { getSuperAdmins, createSuperAdmin, deleteSuperAdmin, type SuperAdmin } from '@/api/admin';

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------
export const Route = createFileRoute('/_layout/users/' as never)({
  component: UsersPage,
});

// ---------------------------------------------------------------------------
// Validation schema
// ---------------------------------------------------------------------------
const addAdminSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  name: z.string().min(1, 'Name is required'),
});

type AddAdminForm = z.infer<typeof addAdminSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Loading skeleton row
// ---------------------------------------------------------------------------
function SkeletonRow() {
  return (
    <tr aria-hidden="true">
      {[180, 220, 120, 80].map((w, i) => (
        <td key={i} className="px-4 py-3">
          <Skeleton width={w} height={16} shape="line" />
        </td>
      ))}
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Add Super Admin dialog
// ---------------------------------------------------------------------------
interface AddAdminDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: AddAdminForm) => Promise<void>;
  isSubmitting: boolean;
}

function AddAdminDialog({ open, onClose, onSubmit, isSubmitting }: AddAdminDialogProps) {
  const [values, setValues] = useState<AddAdminForm>({ email: '', name: '' });
  const [errors, setErrors] = useState<Partial<AddAdminForm>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const handleChange = (field: keyof AddAdminForm, value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    // Clear field error on change
    setErrors((prev) => ({ ...prev, [field]: undefined }));
    setServerError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    const result = addAdminSchema.safeParse(values);
    if (!result.success) {
      const fieldErrors: Partial<AddAdminForm> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as keyof AddAdminForm;
        fieldErrors[field] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    try {
      await onSubmit(result.data);
      // Reset on success
      setValues({ email: '', name: '' });
      setErrors({});
    } catch (err) {
      if (err instanceof Error && err.message.includes('409')) {
        setServerError('A super admin with this email already exists.');
      } else {
        setServerError(err instanceof Error ? err.message : 'An unexpected error occurred.');
      }
    }
  };

  const handleClose = () => {
    setValues({ email: '', name: '' });
    setErrors({});
    setServerError(null);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Super Admin</DialogTitle>
        </DialogHeader>

        <form id="add-admin-form" onSubmit={(e) => void handleSubmit(e)} noValidate>
          <div className="space-y-4 py-2">
            {/* Server error */}
            {serverError && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
              >
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
                <span>{serverError}</span>
              </div>
            )}

            {/* Email */}
            <div className="space-y-1.5">
              <Label htmlFor="add-admin-email">Email address</Label>
              <Input
                id="add-admin-email"
                type="email"
                autoComplete="off"
                placeholder="admin@example.com"
                value={values.email}
                onChange={(e) => handleChange('email', e.target.value)}
                aria-describedby={errors.email ? 'add-admin-email-error' : undefined}
                aria-invalid={Boolean(errors.email)}
              />
              {errors.email && (
                <p id="add-admin-email-error" className="text-xs text-red-600" role="alert">
                  {errors.email}
                </p>
              )}
            </div>

            {/* Name */}
            <div className="space-y-1.5">
              <Label htmlFor="add-admin-name">Full name</Label>
              <Input
                id="add-admin-name"
                type="text"
                autoComplete="off"
                placeholder="Jane Smith"
                value={values.name}
                onChange={(e) => handleChange('name', e.target.value)}
                aria-describedby={errors.name ? 'add-admin-name-error' : undefined}
                aria-invalid={Boolean(errors.name)}
              />
              {errors.name && (
                <p id="add-admin-name-error" className="text-xs text-red-600" role="alert">
                  {errors.name}
                </p>
              )}
            </div>
          </div>
        </form>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" form="add-admin-form" disabled={isSubmitting}>
            {isSubmitting ? 'Granting…' : 'Grant Access'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Admin row
// ---------------------------------------------------------------------------
interface AdminRowProps {
  admin: SuperAdmin;
  isLastAdmin: boolean;
  onDelete: (id: string) => Promise<void>;
  isDeleting: boolean;
}

function AdminRow({ admin, isLastAdmin, onDelete, isDeleting }: AdminRowProps) {
  const [confirming, setConfirming] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

  const handleDelete = async () => {
    setRowError(null);
    try {
      await onDelete(admin.id);
      setConfirming(false);
      toast.success(`Super admin access revoked for ${admin.name}`);
    } catch (err) {
      if (err instanceof Error && err.message.includes('409')) {
        setRowError('Cannot remove the last super admin.');
      } else {
        setRowError(err instanceof Error ? err.message : 'Failed to remove admin.');
      }
      setConfirming(false);
    }
  };

  return (
    <>
      <tr className="border-b last:border-b-0 hover:bg-muted/30 transition-colors">
        <td className="px-4 py-3 text-sm font-medium text-foreground">{admin.name}</td>
        <td className="px-4 py-3 text-sm text-muted-foreground">{admin.email}</td>
        <td className="px-4 py-3 text-sm text-muted-foreground">{formatDate(admin.grantedAt)}</td>
        <td className="px-4 py-3 text-right">
          {confirming ? (
            <div className="flex items-center justify-end gap-2">
              <span className="text-xs text-muted-foreground">Remove?</span>
              <Button
                size="sm"
                variant="danger"
                onClick={() => void handleDelete()}
                disabled={isDeleting}
              >
                {isDeleting ? 'Removing…' : 'Yes, remove'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setConfirming(false);
                  setRowError(null);
                }}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setConfirming(true)}
              disabled={isLastAdmin}
              aria-disabled={isLastAdmin}
              title={isLastAdmin ? 'Cannot remove the last super admin' : `Remove ${admin.name}`}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
              Remove
            </Button>
          )}
        </td>
      </tr>
      {rowError && (
        <tr>
          <td colSpan={4} className="px-4 pb-3">
            <p className="text-xs text-red-600" role="alert">
              {rowError}
            </p>
          </td>
        </tr>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------
function UsersPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // Query
  // -------------------------------------------------------------------------
  const {
    data: admins = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<SuperAdmin[], Error>({
    queryKey: ['superAdmins'],
    queryFn: getSuperAdmins,
    staleTime: 60_000,
  });

  // -------------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------------
  const createMutation = useMutation<SuperAdmin, Error, { email: string; name: string }>({
    mutationFn: ({ email, name: _name }) =>
      // CreateSuperAdminDto uses `userId` — we pass email as userId for the API
      // (backend resolves the user by email; name is display-only in the UI)
      createSuperAdmin({ userId: email }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['superAdmins'] });
    },
  });

  const deleteMutation = useMutation<{ message: string }, Error, string>({
    mutationFn: deleteSuperAdmin,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['superAdmins'] });
    },
  });

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------
  const handleAdd = async (data: AddAdminForm) => {
    await createMutation.mutateAsync({ email: data.email, name: data.name });
    setDialogOpen(false);
    toast.success(`Super admin access granted to ${data.email}`);
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteMutation.mutateAsync(id);
    } finally {
      setDeletingId(null);
    }
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* Page heading */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Super Admins</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage users with super admin access to the platform
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <UserPlus className="h-4 w-4 mr-2" aria-hidden="true" />
          Add Super Admin
        </Button>
      </div>

      {/* Error banner */}
      {isError && (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800"
        >
          <AlertCircle className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
          <span className="flex-1 text-sm">
            {error instanceof Error ? error.message : 'Failed to load super admins.'}
          </span>
          <button
            type="button"
            onClick={() => void refetch()}
            className="flex items-center gap-1.5 rounded px-2.5 py-1 text-sm font-medium hover:bg-red-100 transition-colors"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Retry
          </button>
        </div>
      )}

      {/* Last admin warning */}
      {!isLoading && !isError && admins.length === 1 && (
        <div
          role="note"
          className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800"
        >
          <AlertTriangle className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
          <p className="text-sm">
            Only one super admin exists. Add another before removing this account.
          </p>
        </div>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="Super admins">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Email
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Granted At
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} />)
                ) : admins.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-16 text-center text-sm text-muted-foreground"
                    >
                      No super admins found.
                    </td>
                  </tr>
                ) : (
                  admins.map((admin) => (
                    <AdminRow
                      key={admin.id}
                      admin={admin}
                      isLastAdmin={admins.length <= 1}
                      onDelete={handleDelete}
                      isDeleting={deletingId === admin.id}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Add Super Admin dialog */}
      <AddAdminDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSubmit={handleAdd}
        isSubmitting={createMutation.isPending}
      />
    </div>
  );
}
