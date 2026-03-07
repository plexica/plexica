// apps/web/src/routes/access-control.policies.tsx
//
// Phase 3c — Spec 003 Access Control: Policies list screen.
// Lists all ABAC policies with filter by resource/effect/active state.
// Gated by featureEnabled from PolicyPage meta.
// Spec 003: Authorization System RBAC + ABAC

import { useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Plus, Trash2, Search } from 'lucide-react';
import { toast } from 'sonner';
import {
  Button,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Skeleton,
} from '@plexica/ui';
import { usePolicies, useDeletePolicy } from '@/hooks/usePolicies';
import { EffectBadge } from '@/components/authorization/EffectBadge';
import { PolicySummary } from '@/components/authorization/PolicySummary';
import { DestructiveConfirmModal } from '@/components/DestructiveConfirmModal';
import type { Policy } from '@/hooks/useAuthorizationApi';

export const Route = createFileRoute('/access-control/policies' as never)({
  component: AccessControlPoliciesPage,
});

// ---------------------------------------------------------------------------
// Policy row
// ---------------------------------------------------------------------------

interface PolicyRowProps {
  policy: Policy;
  featureEnabled: boolean;
}

function PolicyRow({ policy, featureEnabled }: PolicyRowProps) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const deletePolicy = useDeletePolicy();

  const isEditable = policy.source === 'tenant_admin';

  return (
    <>
      <tr className="border-b hover:bg-muted/20 transition-colors align-top">
        <td className="px-4 py-3">
          <div className="font-medium text-foreground text-sm">{policy.name}</div>
          <div className="text-xs text-muted-foreground font-mono mt-0.5">{policy.resource}</div>
        </td>
        <td className="px-4 py-3">
          <EffectBadge effect={policy.effect} />
        </td>
        <td className="px-4 py-3 text-xs text-muted-foreground max-w-xs">
          {featureEnabled ? (
            <PolicySummary conditions={policy.conditions} />
          ) : (
            <span className="italic">ABAC disabled</span>
          )}
        </td>
        <td className="px-4 py-3">
          {policy.isActive ? (
            <Badge variant="success">Active</Badge>
          ) : (
            <Badge variant="secondary">Inactive</Badge>
          )}
        </td>
        <td className="px-4 py-3 text-sm text-muted-foreground tabular-nums">{policy.priority}</td>
        <td className="px-4 py-3 text-right">
          {isEditable ? (
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" asChild>
                <Link
                  to={'/access-control/policies/$policyId/edit' as never}
                  params={{ policyId: policy.id } as never}
                >
                  Edit
                </Link>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDeleteOpen(true)}
                aria-label={`Delete policy ${policy.name}`}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground capitalize">{policy.source}</span>
          )}
        </td>
      </tr>

      <DestructiveConfirmModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        variant="typed-confirm"
        confirmText={policy.name}
        title="Delete policy"
        description={`Permanently delete the "${policy.name}" policy.`}
        confirmLabel="Delete"
        onConfirm={() => {
          deletePolicy.mutate(policy.id, {
            onSuccess: () => toast.success(`Policy "${policy.name}" deleted`),
            onError: () => toast.error('Failed to delete policy'),
          });
          setDeleteOpen(false);
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function AccessControlPoliciesPage() {
  const [search, setSearch] = useState('');
  const { data, isLoading, error } = usePolicies({ limit: 100 });

  const featureEnabled = data?.meta.featureEnabled !== false;
  const policies = data?.data ?? [];

  // Client-side filter by search (resource or name)
  const filtered = search
    ? policies.filter(
        (p) =>
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.resource.toLowerCase().includes(search.toLowerCase())
      )
    : policies;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Policies</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage attribute-based access control (ABAC) policies
          </p>
        </div>
        {featureEnabled && (
          <Button asChild>
            <Link to={'/access-control/policies/create' as never}>
              <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
              Create policy
            </Link>
          </Button>
        )}
      </div>

      {/* ABAC disabled banner */}
      {!featureEnabled && (
        <div
          role="status"
          className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground"
        >
          Attribute-based conditions are not enabled for this tenant. Contact your administrator.
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-sm">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          placeholder="Search policies…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
          aria-label="Search policies"
        />
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-destructive text-sm"
        >
          Failed to load policies. Please refresh.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {data ? `${filtered.length} polic${filtered.length !== 1 ? 'ies' : 'y'}` : 'Policies'}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="Policies table">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Name / Resource
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Effect
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Conditions
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Priority
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-right font-medium text-muted-foreground"
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? Array.from({ length: 3 }).map((_, i) => (
                      <tr key={i} className="border-b" aria-hidden="true">
                        <td className="px-4 py-3">
                          <Skeleton className="h-4 w-32 mb-1" />
                          <Skeleton className="h-3 w-24" />
                        </td>
                        <td className="px-4 py-3">
                          <Skeleton className="h-5 w-14" />
                        </td>
                        <td className="px-4 py-3">
                          <Skeleton className="h-4 w-40" />
                        </td>
                        <td className="px-4 py-3">
                          <Skeleton className="h-5 w-16" />
                        </td>
                        <td className="px-4 py-3">
                          <Skeleton className="h-4 w-8" />
                        </td>
                        <td className="px-4 py-3">
                          <Skeleton className="h-8 w-16 ml-auto" />
                        </td>
                      </tr>
                    ))
                  : filtered.map((policy) => (
                      <PolicyRow key={policy.id} policy={policy} featureEnabled={featureEnabled} />
                    ))}

                {!isLoading && filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-10 text-center text-muted-foreground text-sm"
                    >
                      {search ? 'No policies match your search.' : 'No policies found.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
