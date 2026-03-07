// apps/web/src/routes/access-control.policies.$policyId.edit.tsx
//
// Phase 3c — Spec 003 Access Control: Edit policy screen.
// Allows editing name, resource, effect, priority, active state, conditions.
// Only tenant_admin policies are editable; others show read-only view.
// Spec 003: Authorization System RBAC + ABAC

import { useEffect, useState } from 'react';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@plexica/ui';
import { usePolicies, useUpdatePolicy, useDeletePolicy } from '@/hooks/usePolicies';
import { ConditionBuilder } from '@/components/authorization/ConditionBuilder';
import { EffectBadge } from '@/components/authorization/EffectBadge';
import { DestructiveConfirmModal } from '@/components/DestructiveConfirmModal';
import type { ConditionTree } from '@/hooks/useAuthorizationApi';

export const Route = createFileRoute('/access-control/policies/$policyId/edit' as never)({
  component: EditPolicyPage,
});

const updatePolicySchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  resource: z.string().min(1, 'Resource is required'),
  effect: z.enum(['DENY', 'FILTER']),
  priority: z.number().int().min(0).max(9999),
});

function EditPolicyPage() {
  const { policyId } = Route.useParams() as { policyId: string };
  const navigate = useNavigate();

  // Fetch all policies and find by id
  const { data: pageData, isLoading } = usePolicies({ limit: 500 });
  const featureEnabled = pageData?.meta.featureEnabled !== false;
  const policy = pageData?.data.find((p) => p.id === policyId) ?? null;

  const updatePolicy = useUpdatePolicy();
  const deletePolicy = useDeletePolicy();

  const [name, setName] = useState('');
  const [resource, setResource] = useState('');
  const [effect, setEffect] = useState<'DENY' | 'FILTER'>('DENY');
  const [priority, setPriority] = useState(0);
  const [isActive, setIsActive] = useState(true);
  const [conditions, setConditions] = useState<ConditionTree>({ all: [] });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Seed form
  useEffect(() => {
    if (policy) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setName(policy.name);
      setResource(policy.resource);
      setEffect(policy.effect);
      setPriority(policy.priority);
      setIsActive(policy.isActive);
      setConditions(policy.conditions);
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [policy]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = updatePolicySchema.safeParse({ name, resource, effect, priority });
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = String(issue.path[0]);
        fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    try {
      await updatePolicy.mutateAsync({
        id: policyId,
        dto: {
          name: result.data.name,
          resource: result.data.resource,
          effect: result.data.effect,
          priority: result.data.priority,
          isActive,
          conditions,
        },
      });
      toast.success('Policy updated');
      void navigate({ to: '/access-control/policies' as never });
    } catch {
      toast.error('Failed to update policy');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="grid gap-6 lg:grid-cols-[1fr_1.5fr]">
          <div className="h-64 bg-muted animate-pulse rounded-lg" />
          <div className="h-80 bg-muted animate-pulse rounded-lg" />
        </div>
      </div>
    );
  }

  if (!policy) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-destructive text-sm"
      >
        Policy not found.{' '}
        <Link to={'/access-control/policies' as never} className="underline">
          Back to policies
        </Link>
      </div>
    );
  }

  const isEditable = policy.source === 'tenant_admin';

  if (!isEditable) {
    return (
      <div className="space-y-6">
        <div>
          <Link
            to={'/access-control/policies' as never}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to policies
          </Link>
        </div>
        <h1 className="text-2xl font-bold text-foreground">{policy.name}</h1>
        <div
          role="status"
          className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground"
        >
          This policy is managed by <strong>{policy.source}</strong> and cannot be edited here.
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex gap-2">
              <span className="font-medium">Resource:</span>
              <code className="font-mono text-xs bg-muted px-1 rounded">{policy.resource}</code>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium">Effect:</span>
              <EffectBadge effect={policy.effect} />
            </div>
            <div>
              <span className="font-medium">Priority:</span> {policy.priority}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back nav */}
      <div>
        <Link
          to={'/access-control/policies' as never}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to policies
        </Link>
      </div>

      {/* Page title */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold text-foreground">{policy.name}</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setDeleteOpen(true)}
          className="text-destructive hover:text-destructive"
        >
          Delete policy
        </Button>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} noValidate>
        <div className="grid gap-6 lg:grid-cols-[1fr_1.5fr]">
          {/* Policy details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Policy details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="policy-name">
                  Name{' '}
                  <span aria-hidden="true" className="text-destructive">
                    *
                  </span>
                </Label>
                <Input
                  id="policy-name"
                  value={name}
                  aria-required="true"
                  aria-describedby={errors.name ? 'policy-name-err' : undefined}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (errors.name) setErrors((prev) => ({ ...prev, name: '' }));
                  }}
                />
                {errors.name && (
                  <p id="policy-name-err" role="alert" className="text-xs text-destructive">
                    {errors.name}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="policy-resource">
                  Resource{' '}
                  <span aria-hidden="true" className="text-destructive">
                    *
                  </span>
                </Label>
                <Input
                  id="policy-resource"
                  value={resource}
                  aria-required="true"
                  aria-describedby={errors.resource ? 'policy-resource-err' : undefined}
                  onChange={(e) => {
                    setResource(e.target.value);
                    if (errors.resource) setErrors((prev) => ({ ...prev, resource: '' }));
                  }}
                />
                {errors.resource && (
                  <p id="policy-resource-err" role="alert" className="text-xs text-destructive">
                    {errors.resource}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="policy-effect">Effect</Label>
                <Select value={effect} onValueChange={(v) => setEffect(v as 'DENY' | 'FILTER')}>
                  <SelectTrigger id="policy-effect" aria-label="Policy effect">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DENY">DENY — block access entirely</SelectItem>
                    <SelectItem value="FILTER">FILTER — narrow result set</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="policy-priority">Priority (0 = highest)</Label>
                <Input
                  id="policy-priority"
                  type="number"
                  min={0}
                  max={9999}
                  value={priority}
                  onChange={(e) => setPriority(parseInt(e.target.value, 10) || 0)}
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="policy-active"
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="h-4 w-4 rounded border-border"
                />
                <Label htmlFor="policy-active">Active</Label>
              </div>
            </CardContent>
          </Card>

          {/* Conditions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Conditions</CardTitle>
            </CardHeader>
            <CardContent>
              <ConditionBuilder
                value={conditions}
                onChange={setConditions}
                enabled={featureEnabled}
                disabled={updatePolicy.isPending}
              />
            </CardContent>
          </Card>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 mt-6">
          <Button type="button" variant="outline" asChild>
            <Link to={'/access-control/policies' as never}>Cancel</Link>
          </Button>
          <Button type="submit" disabled={updatePolicy.isPending}>
            {updatePolicy.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </form>

      <DestructiveConfirmModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        variant="typed-confirm"
        confirmText={policy.name}
        title="Delete policy"
        description={`Permanently delete "${policy.name}".`}
        confirmLabel="Delete"
        onConfirm={() => {
          deletePolicy.mutate(policyId, {
            onSuccess: () => {
              toast.success(`Policy "${policy.name}" deleted`);
              void navigate({ to: '/access-control/policies' as never });
            },
            onError: () => toast.error('Failed to delete policy'),
          });
          setDeleteOpen(false);
        }}
      />
    </div>
  );
}
