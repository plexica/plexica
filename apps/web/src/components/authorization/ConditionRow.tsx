// apps/web/src/components/authorization/ConditionRow.tsx
//
// Phase 3b — Single leaf condition row: attribute selector, operator, value input.
// Spec 003: Authorization System RBAC + ABAC

import { Input } from '@plexica/ui';
import { Button } from '@plexica/ui';
import { Trash2 } from 'lucide-react';

export interface LeafConditionData {
  attribute: string;
  operator: string;
  value: unknown;
}

export interface ConditionRowProps {
  condition: LeafConditionData;
  onChange: (c: LeafConditionData) => void;
  onRemove: () => void;
  disabled?: boolean;
}

// Attribute namespaces
const ATTRIBUTE_OPTIONS: { value: string; label: string }[] = [
  { value: 'user.id', label: 'user.id' },
  { value: 'user.role', label: 'user.role' },
  { value: 'user.teamId', label: 'user.teamId' },
  { value: 'user.email', label: 'user.email' },
  { value: 'resource.id', label: 'resource.id' },
  { value: 'resource.ownerId', label: 'resource.ownerId' },
  { value: 'resource.type', label: 'resource.type' },
  { value: 'environment.ip', label: 'environment.ip' },
  { value: 'environment.time', label: 'environment.time' },
  { value: 'tenant.id', label: 'tenant.id' },
  { value: 'tenant.plan', label: 'tenant.plan' },
];

const OPERATOR_OPTIONS: { value: string; label: string }[] = [
  { value: 'equals', label: 'equals' },
  { value: 'notEquals', label: 'not equals' },
  { value: 'contains', label: 'contains' },
  { value: 'in', label: 'in' },
  { value: 'greaterThan', label: 'greater than' },
  { value: 'lessThan', label: 'less than' },
  { value: 'exists', label: 'exists' },
];

export function ConditionRow({
  condition,
  onChange,
  onRemove,
  disabled = false,
}: ConditionRowProps) {
  const valueStr =
    condition.value === undefined || condition.value === null ? '' : String(condition.value);

  return (
    <div className="flex items-center gap-2 p-2 rounded-md border bg-background">
      {/* Attribute selector */}
      <select
        className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        value={condition.attribute}
        disabled={disabled}
        onChange={(e) => onChange({ ...condition, attribute: e.target.value })}
        aria-label="Attribute"
      >
        <option value="">Select attribute…</option>
        {ATTRIBUTE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {/* Operator selector */}
      <select
        className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        value={condition.operator}
        disabled={disabled}
        onChange={(e) => onChange({ ...condition, operator: e.target.value })}
        aria-label="Operator"
      >
        <option value="">Select operator…</option>
        {OPERATOR_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {/* Value input — hidden when operator is 'exists' */}
      {condition.operator !== 'exists' && (
        <Input
          className="flex-1 min-w-0"
          placeholder="Value"
          value={valueStr}
          disabled={disabled}
          onChange={(e) => onChange({ ...condition, value: e.target.value })}
          aria-label="Value"
        />
      )}

      {/* Remove button */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onRemove}
        disabled={disabled}
        aria-label="Remove condition"
        className="flex-shrink-0 text-destructive hover:text-destructive"
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
      </Button>
    </div>
  );
}
