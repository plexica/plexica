// textarea.tsx — Textarea component
// Label above, error below, visible focus ring
// WCAG 2.1 AA: aria-invalid, aria-describedby

import * as React from 'react';

import { cn } from '../lib/cn.js';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  id?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, id, disabled, ...props }, ref) => {
    const generatedId = React.useId();
    const textareaId = id ?? generatedId;
    const errorId = `${textareaId}-error`;

    return (
      <div className="flex flex-col gap-1">
        {label !== undefined && (
          <label htmlFor={textareaId} className="text-sm font-medium text-neutral-700">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          disabled={disabled}
          aria-invalid={error !== undefined}
          aria-describedby={error !== undefined ? errorId : undefined}
          className={cn(
            'w-full rounded-md border px-3 py-2 text-sm transition-colors resize-y min-h-[80px]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1',
            error !== undefined
              ? 'border-error text-error-dark'
              : 'border-neutral-300 text-neutral-900',
            disabled === true && 'cursor-not-allowed opacity-50',
            className
          )}
          {...props}
        />
        {error !== undefined && (
          <p id={errorId} className="text-sm text-error" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
