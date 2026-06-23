// select.tsx — Select component
// Built on @radix-ui/react-select
// WCAG 2.1 AA: keyboard navigation handled by Radix, aria-label support

import * as React from 'react';
import * as RadixSelect from '@radix-ui/react-select';
import { ChevronDown, Check } from 'lucide-react';

import { cn } from '../lib/cn.js';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
  options: SelectOption[];
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  'aria-label'?: string;
}

export function Select({
  options,
  value,
  onValueChange,
  placeholder = 'Select…',
  disabled = false,
  id,
  'aria-label': ariaLabel,
}: SelectProps): React.JSX.Element {
  return (
    <RadixSelect.Root
      {...(value !== undefined ? { value } : {})}
      onValueChange={onValueChange}
      disabled={disabled}
    >
      <RadixSelect.Trigger
        id={id}
        aria-label={ariaLabel}
        className={cn(
          'inline-flex h-10 w-full items-center justify-between gap-2 rounded-md border border-neutral-300',
          'bg-white px-3 py-2 text-sm text-neutral-900',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1',
          'data-[placeholder]:text-neutral-400',
          disabled && 'cursor-not-allowed opacity-50'
        )}
      >
        <RadixSelect.Value placeholder={placeholder} />
        <RadixSelect.Icon asChild>
          <ChevronDown className="h-4 w-4 shrink-0 text-neutral-500" aria-hidden="true" />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>

      <RadixSelect.Portal>
        <RadixSelect.Content
          className={cn(
            'z-50 min-w-[8rem] overflow-hidden rounded-md border border-neutral-200 bg-white shadow-md',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'
          )}
          position="popper"
          sideOffset={4}
        >
          <RadixSelect.Viewport className="max-h-60 overflow-y-auto p-1">
            {options.map((opt) => (
              <RadixSelect.Item
                key={opt.value}
                value={opt.value}
                {...(opt.disabled === true ? { disabled: true } : {})}
                className={cn(
                  'relative flex cursor-default select-none items-center rounded-sm px-8 py-1.5 text-sm text-neutral-900',
                  'focus:bg-primary-50 focus:text-primary-900 focus:outline-none',
                  opt.disabled && 'pointer-events-none opacity-50'
                )}
              >
                <RadixSelect.ItemIndicator className="absolute left-2 flex items-center">
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                </RadixSelect.ItemIndicator>
                <RadixSelect.ItemText>{opt.label}</RadixSelect.ItemText>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}
