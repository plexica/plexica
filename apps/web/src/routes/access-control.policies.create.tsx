// apps/web/src/routes/access-control.policies.create.tsx
//
// Phase 3c — Spec 003 Access Control: Create policy screen.
// Form for name, resource, effect, priority, and condition builder.
// Gated by featureEnabled flag from policy list meta.
// Spec 003: Authorization System RBAC + ABAC

import { useState } from 'react';
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
import { useCreatePolicy, usePolicies } from '@/hooks/usePolicies';
import { ConditionBuilder } from '@/components/authorization/ConditionBuilder';
import type { ConditionTree } from '@/hooks/useAuthorizationApi';

export const Route = createFileRoute('/access-control/policies/create' as never)({
  component: CreatePolicyPage,
});

const createPolicySchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  resource: z.string().min(1, 'Resource is required'),
  effect: z.enum(['DENY', 'FILTER']),
  priority: z.number().int().min(0).max(9999),
});

const DEFAULT_CONDITIONS: ConditionTree = { all: [] };

function CreatePolicyPage() {
  const navigate = useNavigate();
  const createPolicy = useCreatePolicy();
  // Fetch once to get featureEnabled flag
  const { data: existingData } = usePolicies({ limit: 1 });
  const featureEnabled = existingData?.meta.featureEnabled !== false;

  const [name, setName] = useState('');
  const [resource, setResource] = useState('');
  const [effect, setEffect] = useState<'DENY' | 'FILTER'>('DENY');
  const [priority, setPriority] = useState(0);
  const [conditions, setConditions] = useState<ConditionTree>(DEFAULT_CONDITIONS);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = createPolicySchema.safeParse({ name, resource, effect, priority });
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
      const policy = await createPolicy.mutateAsync({
        name: result.data.name,
        resource: result.data.resource,
        effect: result.data.effect,
        priority: result.data.priority,
        conditions,
      });
      toast.success(`Policy "${policy.name}" created`);
      void navigate({ to: '/access-control/policies' as never });
    } catch {
      toast.error('Failed to create policy');
    }
  };

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

      <h1 className="text-2xl font-bold text-foreground">Create policy</h1>

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
                  placeholder="e.g. Block inactive users"
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
                  placeholder="e.g. workspace:* or document:read"
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
                disabled={createPolicy.isPending}
              />
            </CardContent>
          </Card>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 mt-6">
          <Button type="button" variant="outline" asChild>
            <Link to={'/access-control/policies' as never}>Cancel</Link>
          </Button>
          <Button type="submit" disabled={createPolicy.isPending}>
            {createPolicy.isPending ? 'Creating…' : 'Create policy'}
          </Button>
        </div>
      </form>
    </div>
  );
}
