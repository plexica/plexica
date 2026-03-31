// input.tsx — Input component
// Types: text, password (with show/hide toggle), email
// States: default, error (aria-invalid + aria-describedby), disabled
// WCAG 2.1 AA: aria-invalid, aria-describedby, visible labels

import * as React from 'react';

import { Eye, EyeOff } from 'lucide-react';

import { cn } from '../lib/cn.js';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, label, error, helperText, id, disabled, ...props }, ref) => {
    const inputId = id ?? React.useId();
    const errorId = `${inputId}-error`;
    const helperId = `${inputId}-helper`;
    const [showPassword, setShowPassword] = React.useState(false);

    const resolvedType =
      type === 'password' ? (showPassword ? 'text' : 'password') : type;

    const describedBy =
      [error !== undefined ? errorId : '', helperText !== undefined ? helperId : '']
        .filter(Boolean)
        .join(' ') || undefined;

    return (
      <div className="flex flex-col gap-1">
        {label !== undefined && (
          <label htmlFor={inputId} className="text-sm font-medium text-neutral-700">
            {label}
          </label>
        )}
        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            type={resolvedType}
            disabled={disabled}
            aria-invalid={error !== undefined}
            aria-describedby={describedBy}
            className={cn(
              'w-full rounded-md border px-3 py-2 text-sm transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1',
              error !== undefined
                ? 'border-error text-error-dark placeholder:text-error'
                : 'border-neutral-300 text-neutral-900',
              disabled === true && 'cursor-not-allowed opacity-50',
              type === 'password' && 'pr-10',
              className
            )}
            {...props}
          />
          {type === 'password' && (
            <button
              type="button"
              onClick={() => { setShowPassword((prev) => !prev); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-700"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword
                ? <EyeOff className="h-4 w-4" aria-hidden="true" />
                : <Eye className="h-4 w-4" aria-hidden="true" />
              }
            </button>
          )}
        </div>
        {error !== undefined && (
          <p id={errorId} className="text-sm text-error" role="alert">
            {error}
          </p>
        )}
        {helperText !== undefined && error === undefined && (
          <p id={helperId} className="text-sm text-neutral-500">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
