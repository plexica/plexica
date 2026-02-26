// apps/web/src/components/plugins/PluginConfigForm.tsx
//
// Auto-generates a React form from a JSON Schema (manifest.configuration.schema).
// Supported field types:
//   string         → Input
//   number/integer → Input type="number"
//   boolean        → Switch
//   enum           → Select
//   array          → repeating field group with add / remove
//   object         → nested <fieldset>
//
// Each schema entry uses `title` for the <label> and `description` for help text.
// Validates the assembled payload on submit before calling onSubmit.
//
// T004-32 — config form section

import { useState, useCallback, useId } from 'react';
import { Button } from '@plexica/ui';
import { Input } from '@plexica/ui';
import { Switch } from '@plexica/ui';
import { Label } from '@plexica/ui';
import { Alert, AlertDescription } from '@plexica/ui';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@plexica/ui';
import { Plus, Trash2 } from 'lucide-react';

// ---------------------------------------------------------------------------
// JSON Schema subset types
// ---------------------------------------------------------------------------

export interface JsonSchemaProperty {
  type?: string | string[];
  title?: string;
  description?: string;
  enum?: (string | number | boolean)[];
  items?: JsonSchemaProperty;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  default?: unknown;
}

export interface JsonSchema {
  type?: string;
  title?: string;
  description?: string;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
}

export interface PluginConfigFormProps {
  schema: JsonSchema;
  initialValues?: Record<string, unknown>;
  pluginId: string;
  onSubmit: (values: Record<string, unknown>) => Promise<void>;
  onCancel?: () => void;
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function validateField(
  key: string,
  value: unknown,
  prop: JsonSchemaProperty,
  required: string[]
): string | null {
  const isRequired = required.includes(key);
  const rawType = Array.isArray(prop.type) ? prop.type[0] : prop.type;

  if (isRequired && (value === '' || value === null || value === undefined)) {
    return `${prop.title ?? key} is required`;
  }

  if (rawType === 'number' || rawType === 'integer') {
    const n = Number(value);
    if (value !== '' && value !== null && value !== undefined && isNaN(n)) {
      return `${prop.title ?? key} must be a number`;
    }
    if (prop.minimum !== undefined && n < prop.minimum) {
      return `${prop.title ?? key} must be at least ${prop.minimum}`;
    }
    if (prop.maximum !== undefined && n > prop.maximum) {
      return `${prop.title ?? key} must be at most ${prop.maximum}`;
    }
  }

  if (rawType === 'string' && typeof value === 'string') {
    if (prop.minLength !== undefined && value.length < prop.minLength) {
      return `${prop.title ?? key} must be at least ${prop.minLength} characters`;
    }
    if (prop.maxLength !== undefined && value.length > prop.maxLength) {
      return `${prop.title ?? key} must be at most ${prop.maxLength} characters`;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Single field renderer
// ---------------------------------------------------------------------------

interface FieldProps {
  fieldKey: string;
  prop: JsonSchemaProperty;
  value: unknown;
  error: string | null;
  onChange: (key: string, value: unknown) => void;
  required: boolean;
  depth?: number;
}

function SchemaField({ fieldKey, prop, value, error, onChange, required, depth = 0 }: FieldProps) {
  const uid = useId();
  const inputId = `${uid}-${fieldKey}`;
  const helpId = `${uid}-${fieldKey}-help`;
  const errorId = `${uid}-${fieldKey}-err`;
  const rawType = Array.isArray(prop.type) ? prop.type[0] : prop.type;
  const label = prop.title ?? fieldKey;

  // enum → Select
  if (prop.enum && prop.enum.length > 0) {
    const strVal = value !== undefined && value !== null ? String(value) : '';
    return (
      <div className="space-y-1">
        <Label htmlFor={inputId}>
          {label}
          {required && (
            <span className="text-red-500 ml-0.5" aria-hidden="true">
              *
            </span>
          )}
        </Label>
        <Select value={strVal} onValueChange={(v) => onChange(fieldKey, v)}>
          <SelectTrigger id={inputId} aria-describedby={prop.description ? helpId : undefined}>
            <SelectValue placeholder={`Select ${label}`} />
          </SelectTrigger>
          <SelectContent>
            {prop.enum.map((opt) => (
              <SelectItem key={String(opt)} value={String(opt)}>
                {String(opt)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {prop.description && (
          <p id={helpId} className="text-xs text-muted-foreground">
            {prop.description}
          </p>
        )}
        {error && (
          <p id={errorId} role="alert" className="text-xs text-red-500">
            {error}
          </p>
        )}
      </div>
    );
  }

  // boolean → Switch
  if (rawType === 'boolean') {
    return (
      <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
        <div className="space-y-0.5">
          <Label htmlFor={inputId} className="text-sm font-medium cursor-pointer">
            {label}
            {required && (
              <span className="text-red-500 ml-0.5" aria-hidden="true">
                *
              </span>
            )}
          </Label>
          {prop.description && (
            <p id={helpId} className="text-xs text-muted-foreground">
              {prop.description}
            </p>
          )}
        </div>
        <Switch
          id={inputId}
          checked={!!value}
          onCheckedChange={(checked) => onChange(fieldKey, checked)}
          aria-describedby={prop.description ? helpId : undefined}
        />
      </div>
    );
  }

  // number / integer → Input[type=number]
  if (rawType === 'number' || rawType === 'integer') {
    return (
      <div className="space-y-1">
        <Label htmlFor={inputId}>
          {label}
          {required && (
            <span className="text-red-500 ml-0.5" aria-hidden="true">
              *
            </span>
          )}
        </Label>
        <Input
          id={inputId}
          type="number"
          value={value !== undefined && value !== null ? String(value) : ''}
          onChange={(e) => onChange(fieldKey, e.target.value === '' ? '' : Number(e.target.value))}
          min={prop.minimum}
          max={prop.maximum}
          aria-describedby={
            [prop.description ? helpId : '', error ? errorId : ''].filter(Boolean).join(' ') ||
            undefined
          }
          aria-invalid={!!error}
        />
        {prop.description && (
          <p id={helpId} className="text-xs text-muted-foreground">
            {prop.description}
          </p>
        )}
        {error && (
          <p id={errorId} role="alert" className="text-xs text-red-500">
            {error}
          </p>
        )}
      </div>
    );
  }

  // array → repeating group
  if (rawType === 'array') {
    const items = Array.isArray(value) ? (value as unknown[]) : [];
    const itemProp: JsonSchemaProperty = prop.items ?? { type: 'string' };
    return (
      <div className="space-y-2">
        <Label>
          {label}
          {required && (
            <span className="text-red-500 ml-0.5" aria-hidden="true">
              *
            </span>
          )}
        </Label>
        {prop.description && <p className="text-xs text-muted-foreground">{prop.description}</p>}
        <div className="space-y-2" role="list" aria-label={`${label} items`}>
          {items.map((item, idx) => (
            <div key={idx} role="listitem" className="flex items-center gap-2">
              <Input
                aria-label={`${label} item ${idx + 1}`}
                type={
                  (Array.isArray(itemProp.type) ? itemProp.type[0] : itemProp.type) === 'number' ||
                  (Array.isArray(itemProp.type) ? itemProp.type[0] : itemProp.type) === 'integer'
                    ? 'number'
                    : 'text'
                }
                value={item !== undefined && item !== null ? String(item) : ''}
                onChange={(e) => {
                  const newItems = [...items];
                  newItems[idx] = e.target.value;
                  onChange(fieldKey, newItems);
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Remove ${label} item ${idx + 1}`}
                onClick={() => {
                  const newItems = items.filter((_, i) => i !== idx);
                  onChange(fieldKey, newItems);
                }}
              >
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
          ))}
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => onChange(fieldKey, [...items, ''])}
          className="mt-1"
        >
          <Plus className="h-4 w-4 mr-1" />
          Add {label} item
        </Button>
        {error && (
          <p role="alert" className="text-xs text-red-500">
            {error}
          </p>
        )}
      </div>
    );
  }

  // object → nested fieldset
  if (rawType === 'object' && prop.properties) {
    return (
      <fieldset className="border border-border rounded-lg p-4 space-y-4">
        <legend className="text-sm font-semibold px-1">
          {label}
          {required && (
            <span className="text-red-500 ml-0.5" aria-hidden="true">
              *
            </span>
          )}
        </legend>
        {prop.description && <p className="text-xs text-muted-foreground">{prop.description}</p>}
        <SchemaFieldGroup
          properties={prop.properties}
          required={prop.required ?? []}
          values={
            typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
          }
          errors={{}}
          onChange={(subKey, subVal) => {
            const current =
              typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
            onChange(fieldKey, { ...current, [subKey]: subVal });
          }}
          depth={depth + 1}
        />
      </fieldset>
    );
  }

  // default: string → Input
  return (
    <div className="space-y-1">
      <Label htmlFor={inputId}>
        {label}
        {required && (
          <span className="text-red-500 ml-0.5" aria-hidden="true">
            *
          </span>
        )}
      </Label>
      <Input
        id={inputId}
        type="text"
        value={
          typeof value === 'string'
            ? value
            : value !== undefined && value !== null
              ? String(value)
              : ''
        }
        onChange={(e) => onChange(fieldKey, e.target.value)}
        maxLength={prop.maxLength}
        aria-describedby={
          [prop.description ? helpId : '', error ? errorId : ''].filter(Boolean).join(' ') ||
          undefined
        }
        aria-invalid={!!error}
      />
      {prop.description && (
        <p id={helpId} className="text-xs text-muted-foreground">
          {prop.description}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Group renderer (iterates properties)
// ---------------------------------------------------------------------------

interface SchemaFieldGroupProps {
  properties: Record<string, JsonSchemaProperty>;
  required: string[];
  values: Record<string, unknown>;
  errors: Record<string, string>;
  onChange: (key: string, value: unknown) => void;
  depth?: number;
}

function SchemaFieldGroup({
  properties,
  required,
  values,
  errors,
  onChange,
  depth = 0,
}: SchemaFieldGroupProps) {
  return (
    <>
      {Object.entries(properties).map(([key, prop]) => (
        <SchemaField
          key={key}
          fieldKey={key}
          prop={prop}
          value={values[key] ?? prop.default ?? ''}
          error={errors[key] ?? null}
          onChange={onChange}
          required={required.includes(key)}
          depth={depth}
        />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main form component
// ---------------------------------------------------------------------------

export function PluginConfigForm({
  schema,
  initialValues = {},
  onSubmit,
  onCancel,
}: PluginConfigFormProps) {
  const properties = schema.properties ?? {};
  const requiredFields = schema.required ?? [];

  // Build initial form state from schema defaults + provided values
  const buildInitial = useCallback(() => {
    const vals: Record<string, unknown> = {};
    for (const [key, prop] of Object.entries(properties)) {
      vals[key] = initialValues[key] ?? prop.default ?? '';
    }
    return vals;
  }, [properties, initialValues]);

  const [values, setValues] = useState<Record<string, unknown>>(buildInitial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = useCallback((key: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    // Clear field error on change
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  function validate(): boolean {
    const newErrors: Record<string, string> = {};
    for (const [key, prop] of Object.entries(properties)) {
      const err = validateField(key, values[key], prop, requiredFields);
      if (err) newErrors[key] = err;
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    if (!validate()) return;

    setIsSubmitting(true);
    try {
      await onSubmit(values);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to save configuration');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (Object.keys(properties).length === 0) {
    return (
      <div className="text-center py-6">
        <p className="text-sm text-muted-foreground">This plugin has no configuration options.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate aria-label="Plugin configuration form">
      <div className="space-y-4">
        {submitError && (
          <Alert variant="destructive">
            <AlertDescription>{submitError}</AlertDescription>
          </Alert>
        )}

        <SchemaFieldGroup
          properties={properties}
          required={requiredFields}
          values={values}
          errors={errors}
          onChange={handleChange}
        />

        <div className="flex items-center justify-end gap-3 pt-2">
          {onCancel && (
            <Button type="button" variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : 'Save Configuration'}
          </Button>
        </div>
      </div>
    </form>
  );
}
