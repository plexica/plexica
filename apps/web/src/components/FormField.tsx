// apps/web/src/components/FormField.tsx

import type { ReactNode } from 'react';
import { Label } from '@plexica/ui';
import { Input } from '@plexica/ui';
import { Textarea } from '@plexica/ui';
import { Alert, AlertDescription } from '@plexica/ui';
import { AlertCircle } from 'lucide-react';

export interface FormFieldProps {
  label: string;
  htmlFor: string;
  error?: string;
  required?: boolean;
  helperText?: string;
  children: ReactNode;
}

/**
 * FormField Component
 *
 * A reusable form field wrapper that combines:
 * - Label component for accessible form labeling
 * - Input/Textarea/Select children
 * - Error display with Alert component
 * - Helper text for additional guidance
 *
 * @example
 * ```tsx
 * <FormField
 *   label="Email Address"
 *   htmlFor="email"
 *   error={errors.email}
 *   helperText="We'll never share your email"
 * >
 *   <Input
 *     id="email"
 *     type="email"
 *     value={formData.email}
 *     onChange={(e) => setFormData({ ...formData, email: e.target.value })}
 *   />
 * </FormField>
 * ```
 */
export function FormField({
  label,
  htmlFor,
  error,
  required = false,
  helperText,
  children,
}: FormFieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>

      <div className="mt-2">{children}</div>

      {error && (
        <Alert variant="destructive" className="py-2">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-sm">{error}</AlertDescription>
        </Alert>
      )}

      {!error && helperText && <p className="text-xs text-muted-foreground">{helperText}</p>}
    </div>
  );
}

/**
 * FormInputField Component
 *
 * A convenience component that wraps FormField + Input
 * for simple text input fields
 *
 * @example
 * ```tsx
 * <FormInputField
 *   label="Name"
 *   htmlFor="name"
 *   type="text"
 *   placeholder="John Doe"
 *   value={name}
 *   onChange={(e) => setName(e.target.value)}
 *   error={errors.name}
 *   required
 * />
 * ```
 */
export interface FormInputFieldProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'id'
> {
  label: string;
  htmlFor: string;
  error?: string;
  helperText?: string;
  required?: boolean;
}

export function FormInputField({
  label,
  htmlFor,
  error,
  helperText,
  required = false,
  ...inputProps
}: FormInputFieldProps) {
  return (
    <FormField
      label={label}
      htmlFor={htmlFor}
      error={error}
      helperText={helperText}
      required={required}
    >
      <Input id={htmlFor} {...inputProps} />
    </FormField>
  );
}

/**
 * FormTextareaField Component
 *
 * A convenience component that wraps FormField + Textarea
 * for textarea fields
 *
 * @example
 * ```tsx
 * <FormTextareaField
 *   label="Description"
 *   htmlFor="description"
 *   placeholder="Enter description..."
 *   value={description}
 *   onChange={(e) => setDescription(e.target.value)}
 *   error={errors.description}
 *   rows={4}
 * />
 * ```
 */
export interface FormTextareaFieldProps extends Omit<
  React.TextareaHTMLAttributes<HTMLTextAreaElement>,
  'id'
> {
  label: string;
  htmlFor: string;
  error?: string;
  helperText?: string;
  required?: boolean;
}

export function FormTextareaField({
  label,
  htmlFor,
  error,
  helperText,
  required = false,
  ...textareaProps
}: FormTextareaFieldProps) {
  return (
    <FormField
      label={label}
      htmlFor={htmlFor}
      error={error}
      helperText={helperText}
      required={required}
    >
      <Textarea id={htmlFor} {...textareaProps} />
    </FormField>
  );
}
