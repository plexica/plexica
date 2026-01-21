// apps/web/src/hooks/useForm.ts

import { useState, useCallback } from 'react';
import type { ZodSchema } from 'zod';

export interface UseFormOptions<T> {
  initialValues: T;
  validationSchema?: ZodSchema;
  onSubmit: (values: T) => Promise<void> | void;
}

export interface UseFormReturn<T> {
  values: T;
  errors: Partial<Record<keyof T, string>>;
  touched: Partial<Record<keyof T, boolean>>;
  isSubmitting: boolean;
  isDirty: boolean;
  handleChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  handleBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  handleSubmit: (e: React.FormEvent<HTMLFormElement>) => Promise<void>;
  setFieldValue: (field: keyof T, value: any) => void;
  setFieldError: (field: keyof T, error: string) => void;
  setFieldTouched: (field: keyof T, touched: boolean) => void;
  reset: () => void;
  resetField: (field: keyof T) => void;
}

/**
 * useForm Hook
 *
 * A lightweight form management hook with validation
 * Supports Zod schema validation
 *
 * @example
 * ```tsx
 * import { useForm } from '@/hooks/useForm';
 * import { z } from 'zod';
 *
 * const schema = z.object({
 *   name: z.string().min(1, 'Name is required'),
 *   email: z.string().email('Invalid email'),
 * });
 *
 * function MyForm() {
 *   const { values, errors, handleChange, handleSubmit } = useForm({
 *     initialValues: { name: '', email: '' },
 *     validationSchema: schema,
 *     onSubmit: async (values) => {
 *       await api.submit(values);
 *     },
 *   });
 *
 *   return (
 *     <form onSubmit={handleSubmit}>
 *       <input name="name" value={values.name} onChange={handleChange} />
 *       {errors.name && <span>{errors.name}</span>}
 *     </form>
 *   );
 * }
 * ```
 */
export function useForm<T extends Record<string, any>>({
  initialValues,
  validationSchema,
  onSubmit,
}: UseFormOptions<T>): UseFormReturn<T> {
  const [values, setValues] = useState<T>(initialValues);
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});
  const [touched, setTouched] = useState<Partial<Record<keyof T, boolean>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const validateField = useCallback(
    (fieldName: keyof T, value: any): string | undefined => {
      if (!validationSchema) return undefined;

      try {
        if ('shape' in validationSchema && validationSchema.shape) {
          // Zod schema with shape
          const shape = validationSchema.shape as Record<string, any>;
          const fieldSchema = shape[String(fieldName)];
          if (fieldSchema) {
            fieldSchema.parse(value);
          }
        }
        return undefined;
      } catch (error: any) {
        if (error.issues && error.issues[0]) {
          return error.issues[0].message;
        }
        return error.message || 'Validation error';
      }
    },
    [validationSchema]
  );

  const validateForm = useCallback(async (): Promise<boolean> => {
    if (!validationSchema) return true;

    try {
      await validationSchema.parseAsync(values);
      setErrors({});
      return true;
    } catch (error: any) {
      const newErrors: Partial<Record<keyof T, string>> = {};
      if (error.issues) {
        error.issues.forEach((err: any) => {
          const field = err.path[0] as keyof T;
          if (field) {
            newErrors[field] = err.message;
          }
        });
      }
      setErrors(newErrors);
      return false;
    }
  }, [values, validationSchema]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const { name, value, type } = e.target;
      const finalValue = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;

      setValues((prev) => ({
        ...prev,
        [name]: finalValue,
      }));
      setIsDirty(true);

      // Clear error when user starts typing
      if (errors[name as keyof T]) {
        setErrors((prev) => {
          const newErrors = { ...prev };
          delete newErrors[name as keyof T];
          return newErrors;
        });
      }
    },
    [errors]
  );

  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const { name } = e.target;
      const fieldName = name as keyof T;

      setTouched((prev) => ({
        ...prev,
        [fieldName]: true,
      }));

      // Validate on blur if validation schema exists
      if (validationSchema && !(fieldName in errors)) {
        const fieldError = validateField(fieldName, values[fieldName]);
        if (fieldError) {
          setErrors((prev) => ({
            ...prev,
            [fieldName]: fieldError,
          }));
        }
      }
    },
    [validationSchema, validateField, errors, values]
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();

      // Validate form
      const isValid = await validateForm();
      if (!isValid) return;

      setIsSubmitting(true);
      try {
        await onSubmit(values);
      } catch (error) {
        console.error('Form submission error:', error);
      } finally {
        setIsSubmitting(false);
      }
    },
    [values, validateForm, onSubmit]
  );

  const setFieldValue = useCallback((field: keyof T, value: any) => {
    setValues((prev) => ({
      ...prev,
      [field]: value,
    }));
    setIsDirty(true);
  }, []);

  const setFieldError = useCallback((field: keyof T, error: string) => {
    setErrors((prev) => ({
      ...prev,
      [field]: error,
    }));
  }, []);

  const setFieldTouched = useCallback((field: keyof T, touched: boolean) => {
    setTouched((prev) => ({
      ...prev,
      [field]: touched,
    }));
  }, []);

  const reset = useCallback(() => {
    setValues(initialValues);
    setErrors({});
    setTouched({});
    setIsDirty(false);
  }, [initialValues]);

  const resetField = useCallback(
    (field: keyof T) => {
      setValues((prev) => ({
        ...prev,
        [field]: initialValues[field],
      }));
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
      setTouched((prev) => {
        const newTouched = { ...prev };
        delete newTouched[field];
        return newTouched;
      });
    },
    [initialValues]
  );

  return {
    values,
    errors,
    touched,
    isSubmitting,
    isDirty,
    handleChange,
    handleBlur,
    handleSubmit,
    setFieldValue,
    setFieldError,
    setFieldTouched,
    reset,
    resetField,
  };
}
